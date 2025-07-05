import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { CfnIPSet, CfnLoggingConfiguration, CfnRuleGroup, CfnWebACL } from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";
import { BuildConfig } from "./common/build-config";

export class WafStack extends Stack {
	public waf: CfnWebACL;

	constructor(scope: Construct, id: string, buildConfig: BuildConfig, props: StackProps) {
		super(scope, id, props);

		const prefix = `${buildConfig.environment}-${buildConfig.project}`;

		// ----------------------
		// Rate Limit
		// ----------------------

		const rateLimitRuleName = `${prefix}-rate-limit`;
		const rateLimitRule = {
			name: rateLimitRuleName,
			priority: 0,
			action: {
				block: {},
			},
			statement: {
				rateBasedStatement: {
					limit: 1500,
					aggregateKeyType: "IP",
				},
			},
			visibilityConfig: {
				sampledRequestsEnabled: true,
				cloudWatchMetricsEnabled: true,
				metricName: rateLimitRuleName,
			},
		};

		// ----------------------
		// Blacklist IPs
		// ----------------------

		const blacklistIpSetName = `${prefix}-blacklist-ipset`;
		const blacklistIpSet = new CfnIPSet(this, blacklistIpSetName, {
			name: blacklistIpSetName,
			scope: "CLOUDFRONT",
			ipAddressVersion: "IPV4",
			addresses: buildConfig.stacks.waf.ipBlacklist,
		});

		const cloudfrontBlacklistRule: CfnRuleGroup.RuleProperty = {
			name: `${prefix}-cdn-blacklist-rule`,
			priority: 1,
			action: { block: {} },
			visibilityConfig: {
				sampledRequestsEnabled: true,
				cloudWatchMetricsEnabled: true,
				metricName: "blacklist-sources",
			},
			statement: {
				orStatement: {
					statements: [
						{
							ipSetReferenceStatement: {
								arn: blacklistIpSet.attrArn,
								ipSetForwardedIpConfig: {
									headerName: "X-Forwarded-For",
									position: "FIRST",
									fallbackBehavior: "NO_MATCH",
								},
							},
						},
						{
							ipSetReferenceStatement: {
								arn: blacklistIpSet.attrArn,
							},
						},
					],
				},
			},
		};

		// ----------------------
		// Whitelist IPs
		// ----------------------

		const whitelistIpSetName = `${prefix}-whitelist-ipset`;
		const whitelistIpSet = new CfnIPSet(this, whitelistIpSetName, {
			name: whitelistIpSetName,
			scope: "CLOUDFRONT",
			ipAddressVersion: "IPV4",
			addresses: buildConfig.stacks.waf.ipWhitelist,
		});

		const cloudfrontWhitelistRule: CfnRuleGroup.RuleProperty = {
			name: `${prefix}-cdn-whitelist-rule`,
			priority: 2,
			action: { allow: {} },
			visibilityConfig: {
				sampledRequestsEnabled: true,
				cloudWatchMetricsEnabled: true,
				metricName: "whitelist-sources",
			},
			statement: {
				orStatement: {
					statements: [
						{
							ipSetReferenceStatement: {
								arn: whitelistIpSet.attrArn,
								ipSetForwardedIpConfig: {
									headerName: "X-Forwarded-For",
									position: "FIRST",
									fallbackBehavior: "NO_MATCH",
								},
							},
						},
						{
							ipSetReferenceStatement: {
								arn: whitelistIpSet.attrArn,
							},
						},
					],
				},
			},
		};

		// ----------------------
		// WAF
		// ----------------------

		const wafName = `${prefix}-cdn-waf`;
		this.waf = new CfnWebACL(this, wafName, {
			name: wafName,
			scope: "CLOUDFRONT",
			defaultAction: { block: {} },
			visibilityConfig: {
				metricName: wafName,
				cloudWatchMetricsEnabled: true,
				sampledRequestsEnabled: true,
			},
			rules: [
				rateLimitRule,
				cloudfrontBlacklistRule,
				cloudfrontWhitelistRule,
				{
					name: "AWS-AWSManagedRulesAmazonIpReputationList",
					priority: 10,
					statement: {
						managedRuleGroupStatement: {
							vendorName: "AWS",
							name: "AWSManagedRulesAmazonIpReputationList",
						},
					},
					overrideAction: {
						none: {},
					},
					visibilityConfig: {
						sampledRequestsEnabled: true,
						cloudWatchMetricsEnabled: true,
						metricName: "AWSManagedRulesAmazonIpReputationList",
					},
				},
				{
					name: "AWS-AWSManagedRulesCommonRuleSet",
					priority: 20,
					statement: {
						managedRuleGroupStatement: {
							vendorName: "AWS",
							name: "AWSManagedRulesCommonRuleSet",
						},
					},
					overrideAction: {
						none: {},
					},
					visibilityConfig: {
						sampledRequestsEnabled: true,
						cloudWatchMetricsEnabled: true,
						metricName: "AWS-AWSManagedRulesCommonRuleSet",
					},
				},
				{
					name: "AWS-AWSManagedRulesKnownBadInputsRuleSet",
					priority: 30,
					statement: {
						managedRuleGroupStatement: {
							vendorName: "AWS",
							name: "AWSManagedRulesKnownBadInputsRuleSet",
						},
					},
					overrideAction: {
						none: {},
					},
					visibilityConfig: {
						sampledRequestsEnabled: true,
						cloudWatchMetricsEnabled: true,
						metricName: "AWS-AWSManagedRulesKnownBadInputsRuleSet",
					},
				},
				{
					name: "AWS-AWSManagedRulesLinuxRuleSet",
					priority: 40,
					statement: {
						managedRuleGroupStatement: {
							vendorName: "AWS",
							name: "AWSManagedRulesLinuxRuleSet",
						},
					},
					overrideAction: {
						none: {},
					},
					visibilityConfig: {
						sampledRequestsEnabled: true,
						cloudWatchMetricsEnabled: true,
						metricName: "AWS-AWSManagedRulesLinuxRuleSet",
					},
				},
				{
					name: "AWS-AWSManagedRulesUnixRuleSet",
					priority: 50,
					statement: {
						managedRuleGroupStatement: {
							vendorName: "AWS",
							name: "AWSManagedRulesUnixRuleSet",
						},
					},
					overrideAction: {
						none: {},
					},
					visibilityConfig: {
						sampledRequestsEnabled: true,
						cloudWatchMetricsEnabled: true,
						metricName: "AWS-AWSManagedRulesUnixRuleSet",
					},
				},
			],
			tags: [
				{
					key: "Name",
					value: wafName,
				},
			],
		});

		// ----------------------
		// NB:
		// - the name of the Log Group MUST start with the prefix "aws-waf-logs"
		// - at the moment, logging can be enabled only from the AWS console, so we only setup the log configuration
		// - the following link was useful to write the filter rules: https://www.pulumi.com/registry/packages/aws/api-docs/wafv2/webaclloggingconfiguration/#with-logging-filter
		// ----------------------

		const logGroupName = `aws-waf-logs-${buildConfig.project}-${buildConfig.environment}`;
		const logGroup = new LogGroup(this, logGroupName, {
			logGroupName: logGroupName,
			retention: RetentionDays.ONE_MONTH,
			removalPolicy: RemovalPolicy.DESTROY,
		});

		const logConfiguration = new CfnLoggingConfiguration(this, `${wafName}-logs`, {
			resourceArn: this.waf.attrArn,
			logDestinationConfigs: [logGroup.logGroupArn],
			loggingFilter: {
				DefaultBehavior: "DROP",
				Filters: [
					{
						Behavior: "KEEP",
						Conditions: [
							{
								ActionCondition: {
									Action: "COUNT",
								},
							},
							{
								ActionCondition: {
									Action: "BLOCK",
								},
							},
						],
						Requirement: "MEETS_ANY",
					},
				],
			},
		});
	}
}
