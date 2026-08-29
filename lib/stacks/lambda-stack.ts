import * as cdk        from 'aws-cdk-lib';
import * as lambda      from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode  from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events      from 'aws-cdk-lib/aws-events';
import * as targets     from 'aws-cdk-lib/aws-events-targets';
import * as dynamodb    from 'aws-cdk-lib/aws-dynamodb';
import * as s3          from 'aws-cdk-lib/aws-s3';
import * as iam         from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apigateway  from 'aws-cdk-lib/aws-apigateway';
import * as appsync     from 'aws-cdk-lib/aws-appsync';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs        from 'aws-cdk-lib/aws-logs';
import { Construct }    from 'constructs';
import * as path        from 'path';
import {
  TABLE_NAMES, BUS_NAME, PHOTO_BUCKET, MODEL_ID,
  SLACK_SECRET_NAME, PLACE_INDEX,
  BID_WINDOW_SEC, EVENTS,
} from '../constants';

interface LambdaStackProps extends cdk.StackProps {
  casesTable:     dynamodb.Table;
  sheltersTable:  dynamodb.Table;
  bidsTable:      dynamodb.Table;
  needsTable:     dynamodb.Table;
  qaTable:        dynamodb.Table;
  photoBucket:    s3.Bucket;
  bus:            events.EventBus;
  shelterASecret: secretsmanager.Secret;
  api:            appsync.GraphqlApi;
  appsyncUrl:     string;
  appsyncApiKey:  string;
}

export class LambdaStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const {
      casesTable, sheltersTable, bidsTable, needsTable, qaTable,
      photoBucket, bus, shelterASecret, api, appsyncUrl, appsyncApiKey,
    } = props;

    // ── Shared Lambda role ─────────────────────────────────────────────────
    const role = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // Table permissions
    casesTable.grantReadWriteData(role);
    sheltersTable.grantReadData(role);
    bidsTable.grantReadWriteData(role);
    needsTable.grantReadWriteData(role);
    qaTable.grantReadWriteData(role);
    photoBucket.grantReadWrite(role);
    bus.grantPutEventsTo(role);
    shelterASecret.grantRead(role);

    // Slack bot credentials — created out-of-band (Secrets Manager doesn't have a CDK
    // construct for "import an existing secret you populated yourself"; fromSecretNameV2
    // is the read side of that).
    const slackSecret = secretsmanager.Secret.fromSecretNameV2(this, 'SlackBotSecret', SLACK_SECRET_NAME);
    slackSecret.grantRead(role);

    // AWS service permissions (Bedrock, Rekognition, Location)
    role.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'rekognition:DetectLabels',
        'rekognition:DetectText',
        'geo:SearchPlaceIndexForPosition',
      ],
      resources: ['*'],
    }));

    // ── Shared environment ─────────────────────────────────────────────────
    const commonEnv: Record<string, string> = {
      CASES_TABLE:       TABLE_NAMES.CASES,
      SHELTERS_TABLE:    TABLE_NAMES.SHELTERS,
      BIDS_TABLE:        TABLE_NAMES.BIDS,
      NEEDS_TABLE:       TABLE_NAMES.NEEDS,
      QA_TABLE:          TABLE_NAMES.QA,
      PHOTO_BUCKET:      `${PHOTO_BUCKET}-${this.account}`,
      EVENT_BUS_NAME:    BUS_NAME,
      REGION:            this.region,
      MODEL_ID,
      BID_WINDOW_SECONDS: String(BID_WINDOW_SEC),
      NODE_OPTIONS:      '--enable-source-maps',
    };

    // ── NodejsFunction factory ─────────────────────────────────────────────
    // esbuild bundles each handler + all its imports into a single file.
    // No Lambda layers or separate package.json needed per function.
    const fn = (
      id: string,
      handler: string,
      extraEnv: Record<string, string> = {},
      timeoutSec = 30,
    ) => new lambdaNode.NodejsFunction(this, id, {
      functionName: `rescuenet-${handler}`,
      entry:        path.join(__dirname, '../../lambda', handler, 'index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      role,
      timeout:      cdk.Duration.seconds(timeoutSec),
      memorySize:   256,
      environment:  { ...commonEnv, ...extraEnv },
      logGroup:     new logs.LogGroup(this, `${id}LogGroup`, {
        logGroupName:  `/aws/lambda/rescuenet-${handler}`,
        retention:     logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      bundling: {
        minify:         true,
        sourceMap:      true,
        sourcesContent: false,
        // esbuild marks all aws-sdk packages as external —
        // they are already present in the Lambda runtime
        externalModules: ['@aws-sdk/*'],
        // Explicitly include non-SDK dependencies if any are added later
        nodeModules: [],
      },
    });

    // ── Lambda functions ───────────────────────────────────────────────────

    const intakeFn = fn('IntakeFn', 'intake');

    // submitReport resolves here rather than in ApiStack — ApiStack is built before
    // this stack exists, so wiring a Lambda data source there would be circular.
    // Constructed with `this` (LambdaStack) as the explicit scope, not api.addLambdaDataSource()
    // (which always scopes its resources to the api's own stack — ApiStack — regardless of
    // which stack's code calls it, which would recreate the exact cycle this is avoiding).
    const intakeDs = new appsync.LambdaDataSource(this, 'IntakeDs', {
      api,
      lambdaFunction: intakeFn,
    });
    // Not intakeDs.createResolver() — like addLambdaDataSource, it scopes the Resolver
    // construct to the api's own stack (ApiStack) regardless of caller, recreating the cycle.
    new appsync.Resolver(this, 'SubmitReportResolver', {
      api,
      dataSource: intakeDs,
      typeName:   'Mutation',
      fieldName:  'submitReport',
    });

    const listNearbyCasesFn = fn('ListNearbyCasesFn', 'list-nearby-cases');
    const listNearbyCasesDs = new appsync.LambdaDataSource(this, 'ListNearbyCasesDs', {
      api,
      lambdaFunction: listNearbyCasesFn,
    });
    new appsync.Resolver(this, 'ListNearbyCasesResolver', {
      api,
      dataSource: listNearbyCasesDs,
      typeName:   'Query',
      fieldName:  'listNearbyCases',
    });

    const getCasePhotosFn = fn('GetCasePhotosFn', 'get-case-photos');
    const getCasePhotosDs = new appsync.LambdaDataSource(this, 'GetCasePhotosDs', {
      api,
      lambdaFunction: getCasePhotosFn,
    });
    new appsync.Resolver(this, 'GetCasePhotosResolver', {
      api,
      dataSource: getCasePhotosDs,
      typeName:   'Query',
      fieldName:  'getCasePhotos',
    });

    const imageAgentFn     = fn('ImageAgentFn',     'image-agent');
    const geocodingAgentFn = fn('GeocodingAgentFn', 'geocoding-agent', {
      PLACE_INDEX,
    });
    const dedupAgentFn     = fn('DedupAgentFn',     'dedup-agent');

    const needsProfileFn   = fn('NeedsProfileFn',   'needs-profile');

    // Tier 1 (API) and Tier 2 (Slack) each fan out over every shelter in their tier
    // from a single Lambda — one function per shelter doesn't scale past 2 shelters.
    const tier1AgentFn = fn('Tier1AgentFn', 'tier1-agent');
    const tier2AgentFn = fn('Tier2AgentFn', 'tier2-agent', {
      SLACK_SECRET_ARN: slackSecret.secretArn,
    });

    const slackWebhookFn = fn('SlackWebhookFn', 'slack-webhook', {
      SLACK_SECRET_ARN: slackSecret.secretArn,
    });

    // Arbitrator runs for up to 20 seconds (bid window + processing)
    const arbitratorFn     = fn('ArbitratorFn',     'arbitrator', {}, 60);

    const confirmHandlerFn = fn('ConfirmHandlerFn', 'confirmation-handler', {
      APPSYNC_URL:     appsyncUrl,
      APPSYNC_API_KEY: appsyncApiKey,
    });

    // Bridges raw DynamoDB writes to AppSync's realtime layer — see the file comment
    // for why this has to exist for onCaseUpdated to fire at all.
    const caseStreamPublisherFn = fn('CaseStreamPublisherFn', 'case-stream-publisher', {
      APPSYNC_URL:     appsyncUrl,
      APPSYNC_API_KEY: appsyncApiKey,
    });
    caseStreamPublisherFn.addEventSource(new DynamoEventSource(casesTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize:         10,
      retryAttempts:      2,
    }));

    // ── Slack inbound webhook — Events API + Interactivity Request URL ──────
    const slackApi = new apigateway.LambdaRestApi(this, 'SlackWebhookApi', {
      handler:    slackWebhookFn,
      proxy:      true,
      deployOptions: { stageName: 'prod' },
    });

    // ── EventBridge rules ──────────────────────────────────────────────────
    // Rule 1: ReportSubmitted → image + geocoding + dedup (parallel fan-out)
    const reportSubmittedRule = new events.Rule(this, 'ReportSubmittedRule', {
      eventBus:    bus,
      ruleName:    'rescuenet-report-submitted',
      description: 'Fan out to specialist agents when a report is submitted',
      eventPattern: {
        source:     [EVENTS.INTAKE.SOURCE],
        detailType: [EVENTS.INTAKE.SUBMITTED],
      },
    });
    reportSubmittedRule.addTarget(new targets.LambdaFunction(imageAgentFn));
    reportSubmittedRule.addTarget(new targets.LambdaFunction(geocodingAgentFn));
    reportSubmittedRule.addTarget(new targets.LambdaFunction(dedupAgentFn));

    // Rule 2: AgentEnriched (from any specialist agent) → dedup orchestration
    // The dedup agent subscribes to its own enriched events to track when
    // all specialist agents have finished, then fires CasePublished.
    const agentEnrichedRule = new events.Rule(this, 'AgentEnrichedRule', {
      eventBus:    bus,
      ruleName:    'rescuenet-agent-enriched',
      description: 'Dedup agent tracks when all specialists have finished enriching',
      eventPattern: {
        source: [
          EVENTS.IMAGE.SOURCE,
          EVENTS.GEOCODING.SOURCE,
        ],
        detailType: ['AgentEnriched'],
      },
    });
    agentEnrichedRule.addTarget(new targets.LambdaFunction(dedupAgentFn));

    // Rule 3: CasePublished → needs profile + Tier 1 + Tier 2 agents (parallel)
    const casePublishedRule = new events.Rule(this, 'CasePublishedRule', {
      eventBus:    bus,
      ruleName:    'rescuenet-case-published',
      description: 'Open the bid window — both tier agents and needs profile fire simultaneously',
      eventPattern: {
        source:     [EVENTS.DEDUP.SOURCE],
        detailType: [EVENTS.DEDUP.PUBLISHED],
      },
    });
    casePublishedRule.addTarget(new targets.LambdaFunction(needsProfileFn));
    casePublishedRule.addTarget(new targets.LambdaFunction(tier1AgentFn));
    casePublishedRule.addTarget(new targets.LambdaFunction(tier2AgentFn));

    // Rule 4: ShelterBid → arbitrator accumulates bids
    const shelterBidRule = new events.Rule(this, 'ShelterBidRule', {
      eventBus:    bus,
      ruleName:    'rescuenet-shelter-bid',
      description: 'Arbitrator receives and accumulates shelter bids',
      eventPattern: {
        source:     [EVENTS.SHELTER.SOURCE],
        detailType: [EVENTS.SHELTER.BID],
      },
    });
    shelterBidRule.addTarget(new targets.LambdaFunction(arbitratorFn));

    // Rule 5: BidWindowClosed → arbitrator scores and assigns winner
    const bidWindowClosedRule = new events.Rule(this, 'BidWindowClosedRule', {
      eventBus:    bus,
      ruleName:    'rescuenet-bid-window-closed',
      description: 'Arbitrator scores all accumulated bids and assigns winner',
      eventPattern: {
        source:     [EVENTS.ARBITRATOR.SOURCE],
        detailType: [EVENTS.ARBITRATOR.WINDOW_CLOSED],
      },
    });
    bidWindowClosedRule.addTarget(new targets.LambdaFunction(arbitratorFn));

    // Rule 6: CaseAssigned → confirmation handler
    const caseAssignedRule = new events.Rule(this, 'CaseAssignedRule', {
      eventBus:    bus,
      ruleName:    'rescuenet-case-assigned',
      description: 'Handle confirmation per shelter autonomy preference',
      eventPattern: {
        source:     [EVENTS.ARBITRATOR.SOURCE],
        detailType: [EVENTS.ARBITRATOR.ASSIGNED],
      },
    });
    caseAssignedRule.addTarget(new targets.LambdaFunction(confirmHandlerFn));

    // Rule 7: ConfirmationReceived → confirmation handler
    const confirmationRule = new events.Rule(this, 'ConfirmationRule', {
      eventBus:    bus,
      ruleName:    'rescuenet-confirmation-received',
      description: 'Shelter coordinator confirms or declines intake',
      eventPattern: {
        source:     [EVENTS.SHELTER.SOURCE],
        detailType: [EVENTS.SHELTER.CONFIRMED],
      },
    });
    confirmationRule.addTarget(new targets.LambdaFunction(confirmHandlerFn));

    // Rule 8: QaAnswerSubmitted → Tier 2 agent processes answer
    const qaAnswerRule = new events.Rule(this, 'QaAnswerRule', {
      eventBus:    bus,
      ruleName:    'rescuenet-qa-answer',
      description: 'Tier 2 agent receives coordinator Q&A answers relayed from Slack',
      eventPattern: {
        source:     [EVENTS.APP.SOURCE],
        detailType: [EVENTS.APP.QA_ANSWER],
      },
    });
    qaAnswerRule.addTarget(new targets.LambdaFunction(tier2AgentFn));

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'IntakeFunctionName',
      { value: intakeFn.functionName });
    new cdk.CfnOutput(this, 'ArbitratorFunctionName',
      { value: arbitratorFn.functionName });
    new cdk.CfnOutput(this, 'SlackWebhookUrl', {
      value: slackApi.url,
      description: 'Paste into the Slack app\'s Event Subscriptions + Interactivity Request URL fields',
    });
  }
}
