import { Stack, StackProps } from "aws-cdk-lib";
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { BuildConfig } from "./common/build-config";
import { NetworkStack } from "./network";

export class SecurityStack extends Stack {
	public albSg: SecurityGroup;
	public ecsServicesSg: SecurityGroup[] = [];

	constructor(scope: Construct, id: string, buildConfig: BuildConfig, networkProps: NetworkStack, props: StackProps) {
		super(scope, id, props);

		const prefix = `${buildConfig.environment}-${buildConfig.project}`;

		// ----------------------
		// ALB
		// ----------------------

		const albSgName = `${prefix}-alb`;
		this.albSg = new SecurityGroup(this, albSgName, {
			securityGroupName: albSgName,
			vpc: networkProps.vpc,
			allowAllOutbound: true,
		});

		// ----------------------
		// ECS Services
		// ----------------------

		buildConfig.stacks.ecs.forEach((service) => {
			const sgName = `${prefix}-ecs-${service.name}`;

			this.ecsServicesSg.push(
				new SecurityGroup(this, sgName, {
					securityGroupName: sgName,
					vpc: networkProps.vpc,
					allowAllOutbound: true,
				})
			);

			// ----------------------
			// NB:
			// Here we don't add the rules to enable access for the ALB to the ECS services
			// because CDK will add it automatically during the deploy
			// ----------------------
		});
	}
}
