#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack   } from '../lib/stacks/storage-stack';
import { DatabaseStack  } from '../lib/stacks/database-stack';
import { MessagingStack } from '../lib/stacks/messaging-stack';
import { ApiStack       } from '../lib/stacks/api-stack';
import { LambdaStack    } from '../lib/stacks/lambda-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

// ── Stack 1: Storage (S3) ──────────────────────────────────────────────────
const storageStack = new StorageStack(app, 'RescueNetStorage', {
  env,
  description: 'RescueNet — S3 photo storage',
});

// ── Stack 2: Database (DynamoDB — the blackboard + supporting tables) ──────
const databaseStack = new DatabaseStack(app, 'RescueNetDatabase', {
  env,
  description: 'RescueNet — DynamoDB tables (blackboard, shelters, bids, needs, Q&A)',
});

// ── Stack 3: Messaging (EventBridge + Secrets Manager) ────────────────────
const messagingStack = new MessagingStack(app, 'RescueNetMessaging', {
  env,
  description: 'RescueNet — EventBridge custom bus and secrets',
});

// ── Stack 4: API (AppSync GraphQL) ─────────────────────────────────────────
// Depends on: Database (needs table ARNs for data sources)
const apiStack = new ApiStack(app, 'RescueNetApi', {
  env,
  description: 'RescueNet — AppSync GraphQL API for report submission and real-time case tracking',
  casesTable:    databaseStack.casesTable,
  sheltersTable: databaseStack.sheltersTable,
});
apiStack.addDependency(databaseStack);

// ── Stack 5: Lambda (all functions + EventBridge rules) ────────────────────
// Depends on: everything above — it wires it all together
const lambdaStack = new LambdaStack(app, 'RescueNetLambda', {
  env,
  description: 'RescueNet — Lambda functions and EventBridge routing rules',
  casesTable:     databaseStack.casesTable,
  sheltersTable:  databaseStack.sheltersTable,
  bidsTable:      databaseStack.bidsTable,
  needsTable:     databaseStack.needsTable,
  qaTable:        databaseStack.qaTable,
  photoBucket:    storageStack.photoBucket,
  bus:            messagingStack.bus,
  shelterASecret: messagingStack.shelterASecret,
  api:            apiStack.api,
  appsyncUrl:     apiStack.api.graphqlUrl,
  appsyncApiKey:  apiStack.apiKey,
});
lambdaStack.addDependency(storageStack);
lambdaStack.addDependency(databaseStack);
lambdaStack.addDependency(messagingStack);
lambdaStack.addDependency(apiStack);
