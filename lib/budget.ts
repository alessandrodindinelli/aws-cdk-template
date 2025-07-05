import { Stack, StackProps } from "aws-cdk-lib";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import { BuildConfig } from "./common/build-config";

export class BudgetStack extends Stack {
	constructor(scope: Construct, id: string, buildConfig: BuildConfig, props: StackProps) {
		super(scope, id, props);

		const prefix = `${buildConfig.environment}-${buildConfig.project}`;

		const topicName = `${prefix}-budget-alerts`;
		const topic = new Topic(this, topicName, {
			topicName: topicName,
		});
		// NB: I'd recommend adding the email address from the console to avoid hard-coding them in the template

		const budgetName = `${prefix}-budget`;
		const budget = new CfnBudget(this, budgetName, {
			budget: {
				budgetName: budgetName,
				budgetType: "COST",
				timeUnit: "MONTHLY",
				budgetLimit: {
					amount: buildConfig.stacks.budget.limit,
					unit: "USD",
				},
			},
			notificationsWithSubscribers: [
				{
					notification: {
						comparisonOperator: "GREATER_THAN",
						notificationType: "ACTUAL",
						threshold: 99,
						thresholdType: "PERCENTAGE",
					},
					subscribers: [
						{
							subscriptionType: "SNS",
							address: topic.topicArn,
						},
					],
				},
				{
					notification: {
						comparisonOperator: "GREATER_THAN",
						notificationType: "ACTUAL",
						threshold: 90,
						thresholdType: "PERCENTAGE",
					},
					subscribers: [
						{
							subscriptionType: "SNS",
							address: topic.topicArn,
						},
					],
				},
			],
		});
	}
}
