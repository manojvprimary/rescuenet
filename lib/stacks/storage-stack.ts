import * as cdk  from 'aws-cdk-lib';
import * as s3   from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { PHOTO_BUCKET } from '../constants';

export class StorageStack extends cdk.Stack {
  public readonly photoBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.photoBucket = new s3.Bucket(this, 'PhotoBucket', {
      bucketName:        `${PHOTO_BUCKET}-${this.account}`,
      removalPolicy:     cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge:          3000,
      }],
      lifecycleRules: [{
        // Auto-delete unprocessed uploads after 7 days
        expiration: cdk.Duration.days(7),
        prefix:     'tmp/',
      }],
    });

    new cdk.CfnOutput(this, 'PhotoBucketName',  { value: this.photoBucket.bucketName });
    new cdk.CfnOutput(this, 'PhotoBucketArn',   { value: this.photoBucket.bucketArn  });
  }
}
