import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Repository, RepositoryEncryption } from "aws-cdk-lib/aws-ecr";
import {
	AwsLogDriver,
	Cluster,
	ContainerImage,
	FargateService,
	FargateTaskDefinition,
	LinuxParameters,
	Protocol,
} from "aws-cdk-lib/aws-ecs";
import {
	ApplicationLoadBalancer,
	ApplicationTargetGroup,
	TargetType,
	ApplicationProtocol,
	ApplicationListener,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { BuildConfig } from "./common/build-config";
import { SecurityStack } from "./security-groups";
import { NetworkStack } from "./network";

export class EcsStack extends Stack {
	public loadBalancer: ApplicationLoadBalancer;
	public targetGroups: ApplicationTargetGroup[] = [];
	public cluster: Cluster;
	public services: FargateService[] = [];
	public tasks: FargateTaskDefinition[] = [];

	constructor(
		scope: Construct,
		id: string,
		buildConfig: BuildConfig,
		networkProps: NetworkStack,
		securityProps: SecurityStack,
		props: StackProps
	) {
		super(scope, id, props);

		const prefix = `${buildConfig.environment}-${buildConfig.project}`;

		// ----------------------
		// ALB
		// ----------------------

		const loadBalancerName = `${prefix}-alb`;
		this.loadBalancer = new ApplicationLoadBalancer(this, loadBalancerName, {
			loadBalancerName: loadBalancerName,
			vpc: networkProps.vpc,
			internetFacing: false,
			securityGroup: securityProps.albSg,
		});

		// ----------------------
		// Target Groups
		// ----------------------

		buildConfig.stacks.ecs.forEach((service, index) => {
			const targetGroupName = `${service.name}-${service.port}-tg`;
			this.targetGroups.push(
				new ApplicationTargetGroup(this, targetGroupName, {
					targetGroupName: targetGroupName,
					vpc: networkProps.vpc,
					targetType: TargetType.IP,
					protocol: ApplicationProtocol.HTTP,
					port: service.port,
					healthCheck: {
						enabled: true,
						path: service.healthCheckPath,
						port: String(service.port),
						timeout: Duration.seconds(20),
						unhealthyThresholdCount: 5,
					},
				})
			);

			const listenerHttp = new ApplicationListener(this, `${loadBalancerName}-${service.name}-http`, {
				loadBalancer: this.loadBalancer,
				port: service.port,
				protocol: ApplicationProtocol.HTTP,
				defaultTargetGroups: [this.targetGroups[index]],
			});
		});

		// ----------------------
		// ECS Cluster
		// ----------------------

		const clusterName = `${buildConfig.environment}-${buildConfig.project}`;
		this.cluster = new Cluster(this, `${clusterName}-cluster`, {
			clusterName: clusterName,
			vpc: networkProps.vpc,
		});

		// ----------------------
		// CloudWatch Log Groups per service
		// ----------------------

		buildConfig.stacks.ecs.forEach((service, index) => {
			const logGroupName = `${prefix}-ecs-${service.name}`;
			const logGroup = new LogGroup(this, logGroupName, {
				logGroupName: logGroupName,
				retention: RetentionDays.TWO_WEEKS,
				removalPolicy: RemovalPolicy.DESTROY,
			});

			const serviceName = `${clusterName}-${service.name}`;

			// ----------------------
			// ECR Repositories
			// ----------------------

			const repositoryName = `${serviceName}-docker`;
			const repository = new Repository(this, repositoryName, {
				repositoryName: repositoryName,
				encryption: RepositoryEncryption.AES_256,
				removalPolicy: RemovalPolicy.DESTROY,
				lifecycleRules: [{ maxImageCount: 10 }],
			});

			// ----------------------
			// IAM Roles
			// ----------------------

			const executionRoleName = `${serviceName}-exec`;
			const executionRole = new Role(this, executionRoleName, {
				assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
				roleName: executionRoleName,
				managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")],
			});

			const taskRoleName = `${serviceName}-task`;
			const taskRole = new Role(this, `${taskRoleName}-role`, {
				assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
				roleName: taskRoleName,
				managedPolicies: [
					ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2ContainerServiceRole"),
					ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryFullAccess"),
				],
			});
			// NB: permissions for ECS Exec
			taskRole.addToPrincipalPolicy(
				new PolicyStatement({
					effect: Effect.ALLOW,
					actions: [
						"ssmmessages:CreateControlChannel",
						"ssmmessages:CreateDataChannel",
						"ssmmessages:OpenControlChannel",
						"ssmmessages:OpenDataChannel",
					],
					resources: ["*"],
				})
			);

			// ----------------------
			// Tasks
			// ----------------------

			const taskName = `${serviceName}-task`;
			this.tasks.push(
				new FargateTaskDefinition(this, `${taskName}-definition`, {
					family: taskName,
					executionRole: executionRole,
					taskRole: taskRole,
					cpu: service.cpu,
					memoryLimitMiB: service.memory,
				})
			);

			const containerName = `${serviceName}-${service.port}`;
			this.tasks[index].addContainer(containerName, {
				containerName: containerName,
				image: ContainerImage.fromEcrRepository(repository, buildConfig.environment),
				portMappings: [{ containerPort: service.port, protocol: Protocol.TCP }],
				environment: service.environment,
				logging: new AwsLogDriver({
					logGroup: logGroup,
					streamPrefix: "log",
				}),
				linuxParameters: new LinuxParameters(this, `${containerName}-params`, {
					initProcessEnabled: true,
				}),
			});

			// ----------------------
			// Services
			// NB: 
			// We specify desiredCount=0 to allow the first deploy to complete successfully, otherwise it would hang indefinetly
			// I'd recommend removing the parameter to avoid overriding the current value in the future during a deploy
			// ----------------------

			this.services.push(
				new FargateService(this, serviceName, {
					serviceName: serviceName,
					cluster: this.cluster,
					taskDefinition: this.tasks[index],
					securityGroups: [securityProps.ecsServicesSg[index]],
					vpcSubnets: { subnets: networkProps.privateSubnets },
					enableExecuteCommand: true,
					desiredCount: 0
				})
			);

			this.targetGroups[index].addTarget(this.services[index]);
		});
	}
}
