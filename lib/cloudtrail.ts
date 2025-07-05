import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Trail } from "aws-cdk-lib/aws-cloudtrail";
import { BlockPublicAccess, Bucket, BucketEncryption, StorageClass } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { BuildConfig } from "./common/build-config";

export class CloudtrailStack extends Stack {
	constructor(scope: Construct, id: string, buildConfig: BuildConfig, props: StackProps) {
		super(scope, id, props);

		const prefix = `${buildConfig.environment}-${buildConfig.project}`;

		// ----------------------
		// S3 Bucket
		// ----------------------

		// NB: I'm adding the account ID in the name to avoid errors if the name already exists in AWS
		const bucketName = `${prefix}-cloudtrail-${buildConfig.account}`;
		const bucket = new Bucket(this, bucketName, {
			bucketName: bucketName,
			versioned: false,
			publicReadAccess: false,
			enforceSSL: true,
			encryption: BucketEncryption.S3_MANAGED,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			lifecycleRules: [
				{
					transitions: [{ storageClass: StorageClass.INTELLIGENT_TIERING, transitionAfter: Duration.days(15) }],
					expiration: Duration.days(90),
				},
			],
			removalPolicy: RemovalPolicy.RETAIN,
		});

		// ----------------------
		// CloudTrail
		// ----------------------

		const trailName = `${prefix}-trail`;
		const trail = new Trail(this, trailName, {
			trailName: trailName,
			bucket: bucket,
			isMultiRegionTrail: true,
		});
	}
}
