import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { AllowedMethods, CachePolicy, Distribution, HttpVersion, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, ObjectOwnership } from "aws-cdk-lib/aws-s3";
import { BuildConfig } from "./common/build-config";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { WafStack } from "./waf-cloudfront";

export class CloudfrontStack extends Stack {
	constructor(scope: Construct, id: string, buildConfig: BuildConfig, wafProps: WafStack, props: StackProps) {
		super(scope, id, props);

		const prefix = `${buildConfig.environment}-${buildConfig.project}`;

		// ----------------------
		// S3 Bucket
		// ----------------------

		// NB: I'm adding the account ID in the name to avoid errors if the name already existing in AWS
		const bucketName = `${prefix}-webapp-${buildConfig.account}`;
		const bucket = new Bucket(this, bucketName, {
			bucketName: bucketName,
			versioned: false,
			publicReadAccess: false,
			enforceSSL: true,
			encryption: BucketEncryption.S3_MANAGED,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			removalPolicy: RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
			objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
			cors: [
				{
					allowedHeaders: ["*"],
					allowedMethods: [HttpMethods.DELETE, HttpMethods.GET, HttpMethods.HEAD, HttpMethods.POST, HttpMethods.PUT],
					allowedOrigins: ["*"],
				},
			],
			metrics: [{ id: "EntireBucket" }],
		});

		// ----------------------
		// CloudFront Distribution
		// ----------------------

		const distributionName = `${prefix}-cdn`;
		const distribution = new Distribution(this, distributionName, {
			comment: distributionName,
			webAclId: wafProps.waf.attrArn,
			defaultRootObject: "index.html",
			defaultBehavior: {
				origin: S3BucketOrigin.withOriginAccessControl(bucket),
				allowedMethods: AllowedMethods.ALLOW_ALL,
				viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
				cachePolicy: CachePolicy.CACHING_OPTIMIZED,
				compress: true,
			},
			httpVersion: HttpVersion.HTTP2_AND_3,
		});
	}
}
