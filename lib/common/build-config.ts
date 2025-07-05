import { App } from "aws-cdk-lib";

export interface BuildConfig {
	readonly account: string;
	readonly region: string;
	readonly project: string;
	readonly environment: string;
	readonly stacks: StacksConfig;
}

export interface StacksConfig {
	budget: BudgetConfig;
	network: NetworkConfig;
	ecs: EcsConfig[];
	schedule: ScheduleConfig;
	waf: WafConfig;
}

export interface BudgetConfig {
	limit: number;
}

export interface NetworkConfig {
	vpcCidr: string;
	privateSubnets: SubnetConfig[];
	publicSubnets: SubnetConfig[];
}
export interface VpcConfig {
	cidr: string;
	id: string;
}
export interface SubnetConfig {
	zone: string;
	cidr: string;
	id: string;
}

export interface EcsConfig {
	name: string;
	cpu: number;
	memory: number;
	port: number;
	healthCheckPath: string;
	environment: { [key: string]: string } | undefined;
}

export interface ScheduleConfig {
	start: string;
	stop: string;
}

export interface WafConfig {
	ipBlacklist: string[];
	ipWhitelist: string[];
}

export function getConfig(app: App): BuildConfig {
	let env: string = app.node.tryGetContext("config");

	if (env && env !== "dev" && env !== "staging" && env !== "prod") {
		throw new Error('Incorrect context variable on CDK command! Pass "config" parameter for example like "-c config=dev".');
	}

	const buildConfig: BuildConfig = app.node.tryGetContext(env);

	if (!buildConfig) throw new Error("Invalid context variable for BuildConfig! Check the compatibility with the interface.");

	return buildConfig;
}
