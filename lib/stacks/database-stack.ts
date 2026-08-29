import * as cdk      from 'aws-cdk-lib';
import * as dynamodb  from 'aws-cdk-lib/aws-dynamodb';
import * as cr        from 'aws-cdk-lib/custom-resources';
import * as iam       from 'aws-cdk-lib/aws-iam';
import { Construct }  from 'constructs';
import { TABLE_NAMES, SHELTERS, ShelterSeed } from '../constants';

// Build the DynamoDB attribute-value item for one seeded shelter. acceptedSpecies is
// written as a List (not a String Set) — DynamoDB Sets unmarshal to native JS Set in
// the Document Client used by the agents, which breaks .includes()/.join() at read time.
function shelterItem(s: ShelterSeed): Record<string, unknown> {
  const item: Record<string, unknown> = {
    shelterId: { S: s.shelterId },
    name:      { S: s.name },
    tier:      { N: String(s.tier) },
    location:  { M: { lat: { N: String(s.lat) }, lng: { N: String(s.lng) } } },
    preferences: { M: {
      confirmationTimeoutSeconds: { N: String(s.confirmationTimeoutSeconds) },
      onTimeout: { S: s.onTimeout },
      filters: { M: {
        acceptedSpecies: { L: s.acceptedSpecies.map(sp => ({ S: sp })) },
        maxUrgency:      { S: s.maxUrgency },
        radiusKm:        { N: String(s.radiusKm) },
      }},
    }},
  };

  if (s.tier === 1) {
    item.capacity = { M: {
      availableSlots:  { N: String(s.availableSlots ?? 0) },
      hasVetOnSite:    { BOOL: s.hasVetOnSite ?? false },
      acceptedSpecies: { L: s.acceptedSpecies.map(sp => ({ S: sp })) },
    }};
  } else {
    item.slack = { M: {
      channelId: { S: s.slackChannelId! },
    }};
  }

  return item;
}

export class DatabaseStack extends cdk.Stack {
  public readonly casesTable:    dynamodb.Table;
  public readonly sheltersTable: dynamodb.Table;
  public readonly bidsTable:     dynamodb.Table;
  public readonly needsTable:    dynamodb.Table;
  public readonly qaTable:       dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Cases — the blackboard ─────────────────────────────────────────────
    // PK: caseId
    // Fixed fields: timestamp, location, reporterId, channel, status
    // Freeform: reportData (open Map — any key/value)
    // Audit:    eventHistory (List of agent contributions)
    this.casesTable = new dynamodb.Table(this, 'CasesTable', {
      tableName:     TABLE_NAMES.CASES,
      partitionKey:  { name: 'caseId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream:        dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'ttl',
    });

    // GSI: query by status (e.g. all SUBMITTED cases for dedup)
    this.casesTable.addGlobalSecondaryIndex({
      indexName:    'status-timestamp-index',
      partitionKey: { name: 'status',    type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Shelters — registry + preferences ─────────────────────────────────
    this.sheltersTable = new dynamodb.Table(this, 'SheltersTable', {
      tableName:     TABLE_NAMES.SHELTERS,
      partitionKey:  { name: 'shelterId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI: query shelters by tier (tier1-agent / tier2-agent fan out over their tier)
    this.sheltersTable.addGlobalSecondaryIndex({
      indexName:    'tier-index',
      partitionKey: { name: 'tier', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Bids — arbitrator accumulates one item per shelter per case ────────
    this.bidsTable = new dynamodb.Table(this, 'BidsTable', {
      tableName:     TABLE_NAMES.BIDS,
      partitionKey:  { name: 'caseId',    type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'shelterId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // ── Needs profiles — case-relative scoring weights ─────────────────────
    this.needsTable = new dynamodb.Table(this, 'NeedsTable', {
      tableName:     TABLE_NAMES.NEEDS,
      partitionKey:  { name: 'caseId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // ── QA sessions — Slack Q&A state for Tier 2 shelter coordinators ─────
    this.qaTable = new dynamodb.Table(this, 'QaTable', {
      tableName:     TABLE_NAMES.QA,
      partitionKey:  { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // GSI: look up sessions by caseId (arbitrator needs this)
    this.qaTable.addGlobalSecondaryIndex({
      indexName:    'caseId-index',
      partitionKey: { name: 'caseId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Seed shelter data via Custom Resource ──────────────────────────────
    const seedRole = new iam.Role(this, 'SeedRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    this.sheltersTable.grantWriteData(seedRole);

    // batchWriteItem PutRequests are upserts, so reusing the same call for onCreate and
    // onUpdate keeps the seed in sync whenever the SHELTERS roster in constants.ts changes —
    // onCreate alone would only ever seed once and never reflect later edits.
    const seedCall: cr.AwsSdkCall = {
      service:            'DynamoDB',
      action:             'batchWriteItem',
      physicalResourceId: cr.PhysicalResourceId.of('SeedShelters'),
      parameters: {
        RequestItems: {
          [TABLE_NAMES.SHELTERS]: SHELTERS.map(s => ({ PutRequest: { Item: shelterItem(s) } })),
        },
      },
    };

    new cr.AwsCustomResource(this, 'SeedShelters', {
      installLatestAwsSdk: false,
      role:     seedRole,
      onCreate: seedCall,
      onUpdate: seedCall,
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.sheltersTable.tableArn, `${this.sheltersTable.tableArn}/index/*`],
      }),
    });

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'CasesTableName',    { value: this.casesTable.tableName    });
    new cdk.CfnOutput(this, 'SheltersTableName', { value: this.sheltersTable.tableName });
    new cdk.CfnOutput(this, 'BidsTableName',     { value: this.bidsTable.tableName     });
    new cdk.CfnOutput(this, 'NeedsTableName',    { value: this.needsTable.tableName    });
    new cdk.CfnOutput(this, 'QaTableName',       { value: this.qaTable.tableName       });
  }
}
