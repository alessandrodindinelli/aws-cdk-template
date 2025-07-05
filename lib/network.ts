import { Stack, StackProps, Tags } from "aws-cdk-lib";
import {
	Vpc,
	PublicSubnet,
	PrivateSubnet,
	CfnInternetGateway,
	CfnVPCGatewayAttachment,
	CfnEIP,
	CfnNatGateway,
	CfnRoute,
	IpAddresses,
} from "aws-cdk-lib/aws-ec2";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { BuildConfig } from "./common/build-config";

export class NetworkStack extends Stack {
	public vpc: Vpc;
	public publicSubnets: PublicSubnet[] = [];
	public privateSubnets: PrivateSubnet[] = [];

	constructor(scope: Construct, id: string, buildConfig: BuildConfig, props: StackProps) {
		super(scope, id, props);

		const prefix = `${buildConfig.environment}-${buildConfig.project}`;

		// ----------------------
		// VPC
		// ----------------------

		const vpcName = `${prefix}`;
		this.vpc = new Vpc(this, `${vpcName}-vpc`, {
			vpcName: vpcName,
			ipAddresses: IpAddresses.cidr(buildConfig.stacks.network.vpcCidr),
			enableDnsSupport: true,
			enableDnsHostnames: true,
			natGateways: 0,
			subnetConfiguration: [],
		});
		Tags.of(this.vpc).add("Name", vpcName);

		new StringParameter(this, `${vpcName}-vpc-output`, {
			parameterName: `${vpcName}-vpc-id`,
			stringValue: this.vpc.vpcId,
		});

		// ----------------------
		// Private Subnets
		// ----------------------

		buildConfig.stacks.network.privateSubnets.forEach((subnet, index) => {
			const privateSubnetName = `${prefix}-pvt-${subnet.zone}`;
			this.privateSubnets.push(
				new PrivateSubnet(this, privateSubnetName, {
					vpcId: this.vpc.vpcId,
					cidrBlock: subnet.cidr,
					availabilityZone: `${buildConfig.region}${subnet.zone}`,
					mapPublicIpOnLaunch: false,
				})
			);
			Tags.of(this.privateSubnets[index]).add("Name", privateSubnetName);

			new StringParameter(this, `${privateSubnetName}-subnet-output`, {
				parameterName: `${privateSubnetName}-subnet-id`,
				stringValue: this.privateSubnets[index].subnetId,
			});

			(this.vpc as any).privateSubnets.push({
				subnetId: this.privateSubnets[index].subnetId,
				availabilityZone: this.privateSubnets[index].availabilityZone,
				routeTable: { routeTableId: this.privateSubnets[index].routeTable },
			});
		});

		// ----------------------
		// Public Subnets
		// ----------------------

		buildConfig.stacks.network.publicSubnets.forEach((subnet, index) => {
			const publicSubnetName = `${prefix}-pub-${subnet.zone}`;
			this.publicSubnets.push(
				new PublicSubnet(this, publicSubnetName, {
					vpcId: this.vpc.vpcId,
					cidrBlock: subnet.cidr,
					availabilityZone: `${buildConfig.region}${subnet.zone}`,
					mapPublicIpOnLaunch: true,
				})
			);
			Tags.of(this.publicSubnets[index]).add("Name", publicSubnetName);

			new StringParameter(this, `${publicSubnetName}-subnet-output`, {
				parameterName: `${publicSubnetName}-subnet-id`,
				stringValue: this.publicSubnets[index].subnetId,
			});

			(this.vpc as any).publicSubnets.push({
				subnetId: this.publicSubnets[index].subnetId,
				availabilityZone: this.publicSubnets[index].availabilityZone,
				routeTable: { routeTableId: this.publicSubnets[index].routeTable },
			});
		});

		// ----------------------
		// Internet Gateway
		// ----------------------

		const internetGatewayName = `${prefix}-igw`;
		const internetGateway = new CfnInternetGateway(this, internetGatewayName, {
			tags: [
				{
					key: "Name",
					value: internetGatewayName,
				},
			],
		});
		const internetGatewayAttachment = new CfnVPCGatewayAttachment(this, `${internetGatewayName}-attachment`, {
			vpcId: this.vpc.vpcId,
			internetGatewayId: internetGateway.ref,
		});

		// ----------------------
		// NAT
		// ----------------------

		const natGatewayEipName = `${prefix}-nat-eip-${buildConfig.stacks.network.privateSubnets[0].zone}`;
		const natGatewayEip = new CfnEIP(this, natGatewayEipName, {
			domain: "vpc",
			tags: [
				{
					key: "Name",
					value: natGatewayEipName,
				},
			],
		});

		const natGatewayName = `${prefix}-nat-${buildConfig.stacks.network.privateSubnets[0].zone}`;
		const natGateway = new CfnNatGateway(this, natGatewayName, {
			subnetId: this.publicSubnets[0].subnetId,
			allocationId: natGatewayEip.attrAllocationId,
			tags: [
				{
					key: "Name",
					value: natGatewayName,
				},
			],
		});

		// ----------------------
		// Private Routes
		// ----------------------

		let privateRoutes: CfnRoute[] = [];
		buildConfig.stacks.network.privateSubnets.forEach((subnet, index) => {
			const routeName = `${prefix}-pvt-${subnet.zone}-rt`;
			privateRoutes.push(
				new CfnRoute(this, routeName, {
					routeTableId: this.privateSubnets[index].routeTable.routeTableId,
					natGatewayId: natGateway.ref,
					destinationCidrBlock: "0.0.0.0/0",
				})
			);
		});

		// ----------------------
		// Public Routes
		// ----------------------

		let publicRoutes: CfnRoute[] = [];
		buildConfig.stacks.network.publicSubnets.forEach((subnet, index) => {
			const routeName = `${prefix}-pub-${subnet.zone}-rt`;
			publicRoutes.push(
				new CfnRoute(this, routeName, {
					routeTableId: this.publicSubnets[index].routeTable.routeTableId,
					gatewayId: internetGateway.ref,
					destinationCidrBlock: "0.0.0.0/0",
				})
			);
			Tags.of(publicRoutes[index]).add("Name", routeName);
		});
	}
}
