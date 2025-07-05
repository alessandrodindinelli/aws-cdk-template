import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { BuildConfig } from "./common/build-config";
import {
	Alarm,
	AlarmRule,
	ComparisonOperator,
	CompositeAlarm,
	Dashboard,
	GraphWidget,
	IMetric,
	Metric,
	TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { EcsStack } from "./ecs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";

export class CloudwatchAlarmsStack extends Stack {
	constructor(scope: Construct, id: string, buildConfig: BuildConfig, ecsProps: EcsStack, props: StackProps) {
		super(scope, id, props);

		const prefix = `${buildConfig.environment}-${buildConfig.project}`;

		// ----------------------
		// SNS Topic
		// ----------------------

		const alarmTopicName = `${prefix}-cw-alarms`;
		const alarmTopic = new Topic(this, alarmTopicName, {
			topicName: alarmTopicName,
		});
		// NB: I'd recommend adding the email address from the console to avoid hard-coding them in the template

		// ----------------------
		// ALB Target Groups
		// ----------------------

		const ecsTgAlarmNames: string[] = [];
		const ecsTgAlarmMetrics: IMetric[] = [];
		const ecsTgAlarms: Alarm[] = [];

		ecsProps.targetGroups.forEach((targetGroup, index) => {
			const tgMetric = new Metric({
				namespace: "AWS/ApplicationELB",
				metricName: "UnHealthyHostCount",
				statistic: "Average",
				dimensionsMap: {
					LoadBalancer: ecsProps.loadBalancer.loadBalancerFullName,
					TargetGroup: targetGroup.targetGroupFullName,
				},
			});
			ecsTgAlarmMetrics.push(tgMetric as IMetric);

			const tgAlarmName = `tg-${prefix}-${buildConfig.stacks.ecs[index].name}-unhealthy-hosts`;
			const tgAlarm = new Alarm(this, `${tgAlarmName}-${index}`, {
				alarmName: tgAlarmName,
				metric: tgMetric,
				datapointsToAlarm: 1,
				evaluationPeriods: 1,
				comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
				threshold: 1,
				treatMissingData: TreatMissingData.MISSING,
			});

			ecsTgAlarmNames.push(tgAlarmName);
			ecsTgAlarms.push(tgAlarm);
		});

		// ----------------------
		// ECS Services
		// ----------------------

		const ecsCpuAlarmMetrics: IMetric[] = [];
		const ecsMemoryAlarmMetrics: IMetric[] = [];

		ecsProps.services.forEach((service, index) => {
			const serviceCpuMetric = new Metric({
				namespace: "AWS/ECS",
				metricName: "CPUUtilization",
				statistic: "Average",
				dimensionsMap: {
					ClusterName: ecsProps.cluster.clusterName,
					ServiceName: service.serviceName,
				},
			});
			ecsCpuAlarmMetrics.push(serviceCpuMetric as IMetric);

			const serviceCpuAlarmName = `ecs-${prefix}-${buildConfig.stacks.ecs[index].name}-cpu-usage`;
			const serviceCpuAlarm = new Alarm(this, `${serviceCpuAlarmName}-${index}`, {
				alarmName: serviceCpuAlarmName,
				metric: serviceCpuMetric,
				evaluationPeriods: 1,
				datapointsToAlarm: 1,
				comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
				threshold: 80,
				treatMissingData: TreatMissingData.MISSING,
			});

			const serviceMemoryMetric = new Metric({
				namespace: "AWS/ECS",
				metricName: "MemoryUtilization",
				statistic: "Average",
				dimensionsMap: {
					ClusterName: ecsProps.cluster.clusterName,
					ServiceName: service.serviceName,
				},
			});
			ecsMemoryAlarmMetrics.push(serviceMemoryMetric as IMetric);

			const serviceMemoryAlarmName = `ecs-${prefix}-${buildConfig.stacks.ecs[index].name}-memory-usage`;
			const serviceMemoryAlarm = new Alarm(this, `${serviceMemoryAlarmName}-${index}`, {
				alarmName: serviceMemoryAlarmName,
				metric: serviceMemoryMetric,
				evaluationPeriods: 1,
				datapointsToAlarm: 1,
				comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
				threshold: 80,
				treatMissingData: TreatMissingData.MISSING,
			});

			// ----------------------
			//	Composite Alarms
			// ----------------------

			const compositeAlarmRule = AlarmRule.fromString(
				`ALARM(${ecsTgAlarmNames[index]}) OR ALARM(${serviceCpuAlarmName}) OR ALARM(${serviceMemoryAlarmName})`
			);

			const compositeAlarmName = `ecs-${prefix}-${buildConfig.stacks.ecs[index].name}-alert`;
			const compositeAlarm = new CompositeAlarm(this, compositeAlarmName, {
				compositeAlarmName: compositeAlarmName,
				alarmRule: compositeAlarmRule,
			});
			compositeAlarm.addAlarmAction(new SnsAction(alarmTopic));
			compositeAlarm.addOkAction(new SnsAction(alarmTopic));
			compositeAlarm.node.addDependency(ecsTgAlarms[index]);
			compositeAlarm.node.addDependency(serviceCpuAlarm);
			compositeAlarm.node.addDependency(serviceMemoryAlarm);
		});

		// ----------------------
		// CW Dashboard
		// ----------------------

		const ecsDashboardName = `${prefix}-ecs-monitor`;
		const ecsDashboard = new Dashboard(this, ecsDashboardName, {
			dashboardName: ecsDashboardName,
		});

		// ALB
		const ecsHealthWidget = new GraphWidget({
			title: "ECS UNHEALTHY TARGETS",
			width: 24,
			left: ecsTgAlarmMetrics,
		});
		ecsDashboard.addWidgets(ecsHealthWidget);

		// ECS
		const ecsBeCpuWidget = new GraphWidget({
			title: "ECS Services CPU",
			width: 12,
			left: ecsCpuAlarmMetrics,
		});
		const ecsBeMemoryWidget = new GraphWidget({
			title: "ECS Services MEMORY",
			width: 12,
			left: ecsMemoryAlarmMetrics,
		});
		ecsDashboard.addWidgets(ecsBeCpuWidget, ecsBeMemoryWidget);
	}
}
