import { App, Stack, Tags } from "aws-cdk-lib";
import { BuildConfig, getConfig } from "../lib/common/build-config";
import { BudgetStack } from "../lib/budget";
import { CloudtrailStack } from "../lib/cloudtrail";
import { NetworkStack } from "../lib/network";
import { EcsStack } from "../lib/ecs";
import { SecurityStack } from "../lib/security-groups";
import { EcsSchedulerStack } from "../lib/ecs-scheduler";
import { CloudfrontStack } from "../lib/cloudfront";
import { CloudwatchAlarmsStack } from "../lib/cloudwatch-alarms";
import { WafStack } from "../lib/waf-cloudfront";

const app = new App();
const buildConfig: BuildConfig = getConfig(app);
const envDetails = {
	account: buildConfig.account,
	region: buildConfig.region,
};

const prefix = `${buildConfig.environment}-${buildConfig.project}`;

// ----------------------
// Budget
// NB: The budget MUST be created in us-east-1
// ----------------------

const budgetStackName = `${prefix}-budget`;
const budgetStack = new BudgetStack(app, budgetStackName, buildConfig, {
	stackName: budgetStackName,
	env: {
		account: buildConfig.account,
		region: "us-east-1",
	},
});
addTagsToStack(budgetStack);

// ----------------------
// CloudTrail
// ----------------------

const cloudtrailStackName = `${prefix}-cloudtrail`;
const cloudtrailStack = new CloudtrailStack(app, cloudtrailStackName, buildConfig, {
	stackName: cloudtrailStackName,
	env: envDetails,
});
addTagsToStack(cloudtrailStack);

// ----------------------
// Network
// ----------------------

const networkStackName = `${prefix}-network`;
const networkStack = new NetworkStack(app, networkStackName, buildConfig, {
	stackName: networkStackName,
	env: envDetails,
});
addTagsToStack(networkStack);

// ----------------------
// Security Groups
// ----------------------

const securityStackName = `${prefix}-security-groups`;
const securityStack = new SecurityStack(app, securityStackName, buildConfig, networkStack, {
	stackName: securityStackName,
	env: envDetails,
});
addTagsToStack(securityStack);

// ----------------------
// ECS
// ----------------------

const ecsStackName = `${prefix}-ecs`;
const ecsStack = new EcsStack(app, ecsStackName, buildConfig, networkStack, securityStack, {
	stackName: ecsStackName,
	env: envDetails,
});
addTagsToStack(ecsStack);

// ----------------------
// ECS Scheduler
// ----------------------

const schedulerEcsStartStackName = `${prefix}-ecs-scheduler`;
const schedulerEcsStartStack = new EcsSchedulerStack(app, schedulerEcsStartStackName, buildConfig, ecsStack, {
	stackName: schedulerEcsStartStackName,
	env: envDetails,
});
addTagsToStack(schedulerEcsStartStack);

// ----------------------
// WAF
// NB: The WAF MUST be created in us-east-1
// ----------------------

const wafCloudfrontStackName = `${prefix}-waf`;
const wafCloudfrontStack = new WafStack(app, wafCloudfrontStackName, buildConfig, {
	stackName: wafCloudfrontStackName,
	env: {
		account: buildConfig.account,
		region: "us-east-1",
	},
});
addTagsToStack(wafCloudfrontStack);

// ----------------------
// CloudFront
// NB: crossRegionReferences=true is needed to to allow the reference of the WAF arn cross-region
// ----------------------

const cloudfrontStackName = `${prefix}-cloudfront`;
const cloudfronStack = new CloudfrontStack(app, cloudfrontStackName, buildConfig, wafCloudfrontStack, {
	stackName: cloudfrontStackName,
	env: envDetails,
	crossRegionReferences: true
});
addTagsToStack(cloudfronStack);

// ----------------------
// CloudWatch
// ----------------------

const cloudwatchAlarmsStackName = `${prefix}-cw-alarms`;
const cloudwatchAlarmsStack = new CloudwatchAlarmsStack(app, cloudwatchAlarmsStackName, buildConfig, ecsStack, {
	stackName: cloudwatchAlarmsStackName,
	env: envDetails,
});
addTagsToStack(cloudwatchAlarmsStack);

// ----------------------
// Local function
// NB: The following function will add the tags to the CloudFormation stack and they will be derived in all child objects
// ----------------------

function addTagsToStack(stack: Stack): void {
	Tags.of(stack).add("created-by", "cdk");
	Tags.of(stack).add("environment", buildConfig.environment);
}
