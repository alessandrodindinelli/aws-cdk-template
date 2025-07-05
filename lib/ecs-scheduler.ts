import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { join } from "path";
import { BuildConfig } from "./common/build-config";
import { EcsStack } from "./ecs";

export class EcsSchedulerStack extends Stack {
	constructor(scope: Construct, id: string, buildConfig: BuildConfig, ecsProps: EcsStack, props: StackProps) {
		super(scope, id, props);

		const prefix = `${buildConfig.environment}-${buildConfig.project}`;

		let ecsServices: string[] = [];
		ecsProps.services.forEach((service) => {
			ecsServices.push(service.serviceName);
		});

		// ----------------------
		// IAM Role
		// ----------------------

		const roleName = `${prefix}-lambda-ecs-scheduler`;
		const role = new Role(this, roleName, {
			roleName: roleName,
			assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
			managedPolicies: [
				ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
				ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
			],
		});
		const statementUpdateEcs = new PolicyStatement();
		statementUpdateEcs.addActions("ecs:DescribeServices");
		statementUpdateEcs.addActions("ecs:DescribeClusters");
		statementUpdateEcs.addActions("ecs:UpdateService");
		statementUpdateEcs.addResources("*");
		role.addToPrincipalPolicy(statementUpdateEcs);

		// ----------------------
		// START Schedule
		// ----------------------

		const lambdaStartName = `${prefix}-ecs-start`;
		const lambdaStart = new Function(this, `${lambdaStartName}-lambda`, {
			functionName: lambdaStartName,
			runtime: Runtime.NODEJS_22_X,
			handler: "ecs-scheduler.handler",
			code: Code.fromAsset(join(__dirname, "./functions/ecs-scheduler")),
			environment: {
				region: buildConfig.region,
				clusterName: ecsProps.cluster.clusterName,
				services: ecsServices.join(),
				desiredCount: "1",
			},
			role: role,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.seconds(120),
		});

		const startRuleName = `${prefix}-ecs-start`;
		const startRule = new Rule(this, `${startRuleName}-rule`, {
			ruleName: startRuleName,
			schedule: Schedule.expression(`cron(${buildConfig.stacks.schedule.start})`),
			targets: [new LambdaFunction(lambdaStart)],
		});

		// ----------------------
		// STOP Schedule
		// ----------------------

		const stopFunctionName = `${prefix}-ecs-stop`;
		const stopFunction = new Function(this, `${stopFunctionName}-lambda`, {
			functionName: stopFunctionName,
			runtime: Runtime.NODEJS_22_X,
			handler: "ecs-scheduler.handler",
			code: Code.fromAsset(join(__dirname, "./functions/ecs-scheduler")),
			environment: {
				region: buildConfig.region,
				clusterName: ecsProps.cluster.clusterName,
				services: ecsServices.join(),
				desiredCount: "0",
			},
			role: role,
			logRetention: RetentionDays.ONE_WEEK,
			timeout: Duration.seconds(120),
		});

		const stopRuleName = `${prefix}-ecs-stop`;
		const stopRule = new Rule(this, `${stopRuleName}-rule`, {
			ruleName: stopRuleName,
			schedule: Schedule.expression(`cron(${buildConfig.stacks.schedule.stop})`),
			targets: [new LambdaFunction(stopFunction)],
		});
	}
}
