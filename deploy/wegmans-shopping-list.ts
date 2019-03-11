import cdk = require('@aws-cdk/cdk');
import * as lambda from "@aws-cdk/aws-lambda";
import * as apigw from '@aws-cdk/aws-apigateway';
import * as dynamo from '@aws-cdk/aws-dynamodb';
import * as sqs from '@aws-cdk/aws-sqs';
import * as kms from '@aws-cdk/aws-kms';
import * as iam from '@aws-cdk/aws-iam';
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";
import { TABLENAME_TOKENSBYACCESS, TABLENAME_TOKENSBYCODE, TABLENAME_TOKENSBYREFRESH } from '../lib/AccessCodeDao';
import { PolicyStatement, PolicyStatementEffect, ArnPrincipal } from '@aws-cdk/aws-iam';
import { TABLENAME_ORDERHISTORYBYUSER } from '../lib/OrderHistoryDao';
import { WorkType } from '../lib/BasicAsyncQueue';

const buildAsset = lambda.Code.asset('./build/build.zip');

export class WegmansCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = {
      AWS_ENCRYPTED: 'true',
      LOGGING_LEVEL: 'debug',
      LOGICAL_ENV: 'development-aws',
      //NOTE: this WEGMANS_APIKEY is encrypted by the KMS key.
      WEGMANS_APIKEY: 'AQICAHhEbkp592DXQD2+erIwWGqDeHoUQnAaX1Sw+4YW0087HwH8RXX/AbEVLZkJKaecLtodAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMiKCMxebwomihAFKIAgEQgDuufhAPULVlpHYsEhxt0lMSrTLLWkQ9Oo1aPWEp16Orm4kvVkGYjgiBn/LAGxpu3MELznE3cqPFDletuA==',
    };

    new WegmansLambda(this, 'AlexaLambdaWegmansShoppingList', {
      handler: 'dist/lambda/alexa/index.handler',
      functionName: 'cdk-wegmans-shopping-list',
      environment,
    });

    const authServerLambdaGenerateAccessCode = new WegmansLambda(this, 'LambdaWegmansAuthServerGenerateAccessCode', {
      handler: 'dist/lambda/server/auth-server.generateAccessCode',
      functionName: 'cdk-wegmans-generate-access-code',
    });

    const authServerLambdaGetTokens = new WegmansLambda(this, 'LambdaWegmansAuthServerGetTokens', {
      handler: 'dist/lambda/server/auth-server.getTokens',
      functionName: 'cdk-wegmans-get-tokens',
    });

    const authServerApi = new apigw.RestApi(this, 'WegmansAuthServerAPI');
    const wegmansAuthResource = authServerApi.root.addResource('wegmans-auth');
    wegmansAuthResource.addResource('access-code').addMethod('POST', new apigw.LambdaIntegration(authServerLambdaGenerateAccessCode));
    wegmansAuthResource.addResource('access-token').addMethod('GET', new apigw.LambdaIntegration(authServerLambdaGetTokens));

    const dynamoOrderHistoryByUser = new dynamo.Table(this, 'WegmansDynamoOrderHistoryByUser', {
      partitionKey: {
        name: 'userId',
        type: dynamo.AttributeType.String,
      },
      billingMode: dynamo.BillingMode.PayPerRequest,
      tableName: TABLENAME_ORDERHISTORYBYUSER,
    });
    const dynamoTokensByAccess = new dynamo.Table(this, 'WegmansDynamoTokensByAccessToken', {
      partitionKey: {
        name: 'access',
        type: dynamo.AttributeType.String,
      },
      billingMode: dynamo.BillingMode.PayPerRequest,
      tableName: TABLENAME_TOKENSBYACCESS,
    });
    const dynamoTokensByRefresh = new dynamo.Table(this, 'WegmansDynamoTokensByRefreshToken', {
      partitionKey: {
        name: 'refresh',
        type: dynamo.AttributeType.String,
      },
      billingMode: dynamo.BillingMode.PayPerRequest,
      tableName: TABLENAME_TOKENSBYREFRESH,
    });
    const dynamoTokensByCode = new dynamo.Table(this, 'WegmansDynamoTokensByAccessCode', {
      partitionKey: {
        name: 'access_code',
        type: dynamo.AttributeType.String,
      },
      billingMode: dynamo.BillingMode.PayPerRequest,
      tableName: TABLENAME_TOKENSBYCODE,
    }); //TODO: delete the dynamo autoscaling alarms in cloudwatch, they cost like $3.20 a month

    const dynamoAccessPolicy = new PolicyStatement(PolicyStatementEffect.Allow)
      .addActions(
        'dynamodb:Batch*',
        'dynamodb:Get*',
        'dynamodb:Describe*',
        'dynamodb:DeleteItem',
        'dynamodb:List*',
        'dynamodb:PutItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:UpdateItem',
      ).addResources(
        dynamoOrderHistoryByUser.tableArn,
        dynamoTokensByAccess.tableArn,
        dynamoTokensByCode.tableArn,
        dynamoTokensByRefresh.tableArn,
      );

    const kmsPolicy = new PolicyStatement(PolicyStatementEffect.Allow)
        .addActions('kms:Decrypt', 'kms:Encrypt')
        .addResource('arn:aws:kms:us-east-1:412272193202:key/1df4d245-9e29-492e-9ee4-93969cad1309');

    // Update lambda policies
      WegmansLambda.wegmansLambdas.forEach(wl => {
        wl.addToRolePolicy(kmsPolicy);
        wl.addToRolePolicy(dynamoAccessPolicy);
      });
      // TODO: better way to manage these lambda policies all in one place?


    for (const workType of Object.keys(WorkType)) {
      const queueAndWorker = new QueueAndWorker(this, {
        workType: (WorkType as any)[workType],
        environment
      });

      const enqueuerPolicy = new PolicyStatement(PolicyStatementEffect.Allow)
      .addAction('sqs:SendMessage')
      .addResource(queueAndWorker.queue.queueArn);

      WegmansLambda.wegmansLambdas.forEach(wl => wl.addToRolePolicy(enqueuerPolicy));
      queueAndWorker.worker.addToRolePolicy(kmsPolicy);
    }
  }
}

class WegmansLambda extends lambda.Function {
  static readonly wegmansLambdas: WegmansLambda[] = [];

  constructor(scope: cdk.Stack, id: string, props: {
    handler: string,
    functionName: string,
    environment?: { [key: string]: string } // NOTE: FunctionProps.environment can supposedly have 'any' values, but cdk deploy fails if you give non-string values
  }) {
    super(scope, id, {
      runtime: lambda.Runtime.NodeJS810,
      handler: props.handler,
      code: buildAsset,
      functionName: props.functionName,
      environment: props.environment || {},
      timeout: 30,
    });
    WegmansLambda.wegmansLambdas.push(this);
  }
}

class QueueAndWorker {

  private _queue: sqs.Queue;
  get queue(): sqs.Queue {
    return this._queue;
  }
  
  private _worker : lambda.Function;
  get worker() : lambda.Function {
    return this._worker;
  }

  constructor(scope: cdk.Stack, props: {
    workType: WorkType
    environment: { [key: string]: string },
  }) {
    this._queue = new sqs.Queue(scope, `WegmansWorkerQueue${props.workType}`, {
      queueName: `wegmans-worker-${props.workType}`,
    });

    this._worker = new lambda.Function(scope, `WegmansWorkerLambda${props.workType}`, {
      runtime: lambda.Runtime.NodeJS810,
      code: buildAsset,
      functionName: `cdk-wegmans-worker-${props.workType}`,
      handler: `dist/lambda/workers/${props.workType}.handler`,
      timeout: 30,
      environment: props.environment,
    });
    this._worker.addEventSource(new SqsEventSource(this._queue));

  }
}
