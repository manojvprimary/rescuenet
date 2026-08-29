import * as cdk     from 'aws-cdk-lib';
import * as events   from 'aws-cdk-lib/aws-events';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { BUS_NAME, SECRET_NAME } from '../constants';

export class MessagingStack extends cdk.Stack {
  public readonly bus:           events.EventBus;
  public readonly shelterASecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── EventBridge custom bus — the shared event backbone ─────────────────
    this.bus = new events.EventBus(this, 'RescueNetBus', {
      eventBusName: BUS_NAME,
      description:  'RescueNet blackboard event bus — all agent communication flows through here',
    });

    // Archive: retain all events for 7 days (useful for replay / debugging)
    this.bus.archive('BusArchive', {
      archiveName:    'rescuenet-archive',
      retention:      cdk.Duration.days(7),
      eventPattern:   {}, // archive everything
    });

    // ── Secrets Manager — Shelter A mock API key ───────────────────────────
    this.shelterASecret = new secretsmanager.Secret(this, 'ShelterAApiKey', {
      secretName:        SECRET_NAME,
      description:       'API key for Shelter A (Tier 3 demo) — replace with real key in production',
      secretStringValue: cdk.SecretValue.unsafePlainText('demo-api-key-shelter-a-12345'),
    });

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'EventBusName',     { value: this.bus.eventBusName });
    new cdk.CfnOutput(this, 'EventBusArn',      { value: this.bus.eventBusArn  });
    new cdk.CfnOutput(this, 'ShelterASecretArn',{ value: this.shelterASecret.secretArn });
  }
}
