import * as cdk      from 'aws-cdk-lib';
import * as appsync  from 'aws-cdk-lib/aws-appsync';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { API_NAME }  from '../constants';

interface ApiStackProps extends cdk.StackProps {
  casesTable:    dynamodb.Table;
  sheltersTable: dynamodb.Table;
}

export class ApiStack extends cdk.Stack {
  public readonly api:    appsync.GraphqlApi;
  public readonly apiKey: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    this.api = new appsync.GraphqlApi(this, 'RescueNetApi', {
      name: API_NAME,
      definition: appsync.Definition.fromFile('lib/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            description: 'RescueNet API key',
            expires:     cdk.Expiration.after(cdk.Duration.days(365)),
          },
        },
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
      },
    });

    this.apiKey = this.api.apiKey ?? '';

    // ── Data sources ───────────────────────────────────────────────────────
    const casesDs    = this.api.addDynamoDbDataSource('CasesDs', props.casesTable);
    const sheltersDs = this.api.addDynamoDbDataSource('SheltersDs', props.sheltersTable);
    // NONE — no backing resource. Exists purely so publishCaseUpdate has somewhere to
    // resolve to; it echoes its input straight back so @aws_subscribe has a mutation
    // to key off. The real write already happened in DynamoDB before this is called.
    const publishDs  = this.api.addNoneDataSource('PublishCaseUpdateDs');

    // ── Resolvers ──────────────────────────────────────────────────────────
    casesDs.createResolver('GetCaseResolver', {
      typeName:  'Query',
      fieldName: 'getCase',
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbGetItem('caseId', 'caseId'),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    sheltersDs.createResolver('ListSheltersResolver', {
      typeName:  'Query',
      fieldName: 'listShelters',
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    });

    publishDs.createResolver('PublishCaseUpdateResolver', {
      typeName:  'Mutation',
      fieldName: 'publishCaseUpdate',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        { "version": "2018-05-29", "payload": $util.toJson($ctx.args.input) }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson($ctx.result)'),
    });

    // submitReport resolves via a Lambda data source added from LambdaStack, once
    // intakeFn exists there — see lambda-stack.ts. Kept out of this stack to avoid
    // a circular dependency (LambdaStack already depends on this stack for appsyncUrl).

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AppSyncEndpoint', { value: this.api.graphqlUrl });
    new cdk.CfnOutput(this, 'AppSyncApiKey',   { value: this.apiKey         });
    new cdk.CfnOutput(this, 'AppSyncApiId',    { value: this.api.apiId      });
  }
}
