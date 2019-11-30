import cdk = require("@aws-cdk/core");
import * as lambda from "@aws-cdk/aws-lambda";
import * as apigw from "@aws-cdk/aws-apigateway";
import * as dynamo from "@aws-cdk/aws-dynamodb";
import * as sqs from "@aws-cdk/aws-sqs";
import * as iam from "@aws-cdk/aws-iam";
import * as events from "@aws-cdk/aws-events";
import * as events_targets from "@aws-cdk/aws-events-targets";
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";
import {
  TABLENAME_TOKENSBYACCESS,
  TABLENAME_TOKENSBYCODE,
  TABLENAME_TOKENSBYREFRESH,
  TABLENAME_PREREFRESHEDTOKENSBYREFRESH
} from "../lib/AccessCodeDao";
import { PolicyStatement, Effect } from "@aws-cdk/aws-iam";
import { TABLENAME_ORDERHISTORYBYUSER, orderHistoryDao, tableOrderHistoryByUser, RESOURCENAME_ORDERHISTORYBYUSER } from "../lib/OrderHistoryDao";
import { WorkType } from "../lib/BasicAsyncQueue";
import { config } from "../lib/config";
import { TABLENAME_PRODUCTREQUESTHISTORY } from "../lib/ProductRequestHistoryDao";
import { LogGroup, RetentionDays } from "@aws-cdk/aws-logs";
import { Duration } from "@aws-cdk/core";
import { Schedule } from "@aws-cdk/aws-events";
import { dynamoTablesFromSdk } from "./Sdk2CdkUtils";
import { worker } from "cluster";

const buildAsset = lambda.Code.asset("./build/build.zip");

export class WegmansCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    if (!config.get("aws.lambda.functionNames.cdk-wegmans-worker-prefix")) {
      throw new Error("wtf");
    } else {
      console.log(config.get("aws.lambda.functionNames.cdk-wegmans-worker-prefix"));
    }
    if (!config.get("logical_env")) {
      throw new Error("You must set LOGICAL_ENV to development or production");
    }
    const environment: { [name: string]: string } = {
      AWS_ENCRYPTED: "true",
      LOGGING_LEVEL: "debug",
      LOGICAL_ENV: config.get("logical_env"),
      //NOTE: this WEGMANS_APIKEY is encrypted by the KMS key.
      WEGMANS_APIKEY:
        "AQICAHhEbkp592DXQD2+erIwWGqDeHoUQnAaX1Sw+4YW0087HwH8RXX/AbEVLZkJKaecLtodAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMiKCMxebwomihAFKIAgEQgDuufhAPULVlpHYsEhxt0lMSrTLLWkQ9Oo1aPWEp16Orm4kvVkGYjgiBn/LAGxpu3MELznE3cqPFDletuA=="
    };
    if (config.get("logical_env") === "production") {
      environment.LIVE_RUN = "1";
    }

    new WegmansLambda(this, "AlexaLambdaWegmansShoppingList", {
      handler: "dist/lambda/alexa/index.handler",
      functionName: config.get("aws.lambda.functionNames.cdk-wegmans-shopping-list"),
      environment
    });

    const authServerLambdaGenerateAccessCode = new WegmansLambda(this, "LambdaWegmansAuthServerGenerateAccessCode", {
      handler: "dist/lambda/server/auth-server.generateAccessCode",
      functionName: config.get("aws.lambda.functionNames.cdk-wegmans-generate-access-code"),
      environment
    });

    const authServerLambdaGetTokens = new WegmansLambda(this, "LambdaWegmansAuthServerGetTokens", {
      handler: "dist/lambda/server/auth-server.getTokens",
      functionName: config.get("aws.lambda.functionNames.cdk-wegmans-get-tokens"),
      environment: {
        ...environment,
        ALEXA_SKILL_NAME: config.get("alexa.skill.name"),
        ALEXA_SKILL_SECRET: config.get("alexa.skill.secret")
        //TODO: put all these env vars in config files?
      }
    });

    const authServerApi = new apigw.RestApi(this, "WegmansAuthServerAPI", {
      deployOptions: {
        dataTraceEnabled: false
        // loggingLevel: apigw.MethodLoggingLevel.Info,
      }
    });
    const wegmansAuthResource = authServerApi.root.addResource("wegmans-auth");
    const accessCodeRsource = wegmansAuthResource.addResource("access-code");
    accessCodeRsource.addMethod("POST", new apigw.LambdaIntegration(authServerLambdaGenerateAccessCode));
    addCorsOptions(accessCodeRsource);
    const accessTokenResource = wegmansAuthResource.addResource("access-token");
    accessTokenResource.addMethod("POST", new apigw.LambdaIntegration(authServerLambdaGetTokens));
    addCorsOptions(accessTokenResource);

    // TODO: generate schema from code?
TODO: make this worker, follow this pattern
    const dynamoOrderHistoryTables = dynamoTablesFromSdk(this, {
      tableParams: orderHistoryDao.tableParams,
      resourceName: RESOURCENAME_ORDERHISTORYBYUSER,
    });
    const dynamoTokensByAccess = new dynamo.Table(this, "WegmansDynamoTokensByAccessToken", {
      partitionKey: {
        name: "access",
        type: dynamo.AttributeType.STRING
      },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      tableName: TABLENAME_TOKENSBYACCESS
    });
    const dynamoTokensByRefresh = new dynamo.Table(this, "WegmansDynamoTokensByRefreshToken", {
      partitionKey: {
        name: "refresh",
        type: dynamo.AttributeType.STRING
      },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      tableName: TABLENAME_TOKENSBYREFRESH
    });
    const dynamoTokensByCode = new dynamo.Table(this, "WegmansDynamoTokensByAccessCode", {
      partitionKey: {
        name: "access_code",
        type: dynamo.AttributeType.STRING
      },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      tableName: TABLENAME_TOKENSBYCODE
    }); //TODO: delete the dynamo autoscaling alarms in cloudwatch, they cost like $3.20 a month
    const dynamoPreRefreshedTokens = new dynamo.Table(this, "WegmansDynamoPreRefreshedTokens", {
      partitionKey: {
        name: "refreshed_by",
        type: dynamo.AttributeType.STRING
      },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      tableName: TABLENAME_PREREFRESHEDTOKENSBYREFRESH
    });
    const dynamoProductRequestHistory = new dynamo.Table(this, "WegmansDynamoProductRequestHistory", {
      partitionKey: {
        name: "user_query",
        type: dynamo.AttributeType.STRING
      },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      tableName: TABLENAME_PRODUCTREQUESTHISTORY
    });

    // TODO: more granular access policies per worker?
    const dynamoAccessPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "dynamodb:Batch*",
        "dynamodb:Get*",
        "dynamodb:Describe*",
        "dynamodb:DeleteItem",
        "dynamodb:List*",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem"
      ],
      resources: [
        ...dynamoOrderHistoryTables.map(t => t.tableArn),
        dynamoTokensByAccess.tableArn,
        dynamoTokensByCode.tableArn,
        dynamoTokensByRefresh.tableArn,
        dynamoPreRefreshedTokens.tableArn,
        dynamoProductRequestHistory.tableArn
      ]
    });

    const kmsPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["kms:Decrypt", "kms:Encrypt"],
      resources: [`arn:aws:kms:us-east-1:${config.get("aws.account.number")}:key/1df4d245-9e29-492e-9ee4-93969cad1309`]
    });

    // Update lambda policies
    WegmansLambda.addToAllRolePolicies(kmsPolicy);
    WegmansLambda.addToAllRolePolicies(dynamoAccessPolicy);
    // TODO: better way to manage these lambda policies all in one place? Is that even a good idea (principle of least privilege)?

    for (const workType of Object.keys(WorkType)) {
      const queueAndWorker = new QueueAndWorker(this, {
        workType: (WorkType as any)[workType],
        environment
      });

      const enqueuerPolicy = new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["sqs:SendMessage"],
        resources: [queueAndWorker.queue.queueArn]
      });

      // Every WegmansLambda (eg. alexa handler, auth handlers) can do anything with dynamo.... :-/
      // TODO: the workers should EXCLUSIVELY call APIs, not call directly to the database?
      WegmansLambda.wegmansLambdas.forEach(wl => wl.addToRolePolicy(enqueuerPolicy));

      queueAndWorker.worker.addToRolePolicy(kmsPolicy);

      // Every worker can do anything with dynamo
      queueAndWorker.worker.addToRolePolicy(dynamoAccessPolicy);
    }

    // Crons
    //TODO: some cron framework that reads all the cron files?
    const lambdaOrderHistoryUpdater = new WegmansLambda(this, "LambdaWegmansOrderHistoryUpdater", {
      environment,
      functionName: config.get("aws.lambda.functionNames.cdk-wegmans-cron-order-history-updater"),
      handler: "dist/lambda/cron/order-history-updater.handler",
      timeout: 180 //TODO: alerting for these lambdas (response / error spikes?)
    });

    new events.Rule(this, "EventWegmansOrderHistoryUpdater", {
      description: "Cron trigger for wegmans order history updater",
      ruleName: config.get("aws.lambda.functionNames.cdk-wegmans-cron-order-history-updater"),
      schedule: Schedule.expression("cron(0 4 * * ? *)"),
      targets: [new events_targets.LambdaFunction(lambdaOrderHistoryUpdater)]
    });

    const lambdaTokenRefresher = new WegmansLambda(this, "LambdaWegmansTokenRefresher", {
      environment,
      functionName: config.get("aws.lambda.functionNames.cdk-wegmans-cron-access-token-refresher"),
      handler: "dist/lambda/cron/access-token-refresher.handler",
      timeout: 180 //TODO: alerting for these lambdas (response / error spikes?)
    });

    new events.Rule(this, "EventWegmansTokenRefresher", {
      description: "Cron trigger for wegmans token refresher",
      ruleName: config.get("aws.lambda.functionNames.cdk-wegmans-cron-access-token-refresher"),
      schedule: Schedule.expression("cron(30 4,12,16 * * ? *)"), // Run the refresher every 8 hours
      targets: [new events_targets.LambdaFunction(lambdaTokenRefresher)]
    });
  }
}

class WegmansLambda extends lambda.Function {
  static readonly wegmansLambdas: WegmansLambda[] = [];
  static rolePolicyStatements: iam.PolicyStatement[] = [];

  constructor(
    scope: cdk.Stack,
    id: string,
    props: {
      handler: string;
      functionName: string;
      environment?: { [key: string]: string }; // NOTE: FunctionProps.environment can supposedly have 'any' values, but cdk deploy fails if you give non-string values
      timeout?: number;
    }
  ) {
    super(scope, id, {
      runtime: lambda.Runtime.NODEJS_10_X,
      handler: props.handler,
      code: buildAsset,
      functionName: props.functionName,
      environment: props.environment || {},
      timeout: Duration.seconds(props.timeout || 30)
    });
    WegmansLambda.rolePolicyStatements.forEach(statement => {
      this.addToRolePolicy(statement);
    });
    WegmansLambda.wegmansLambdas.push(this);
    new LogGroup(scope, id + "Logs", {
      logGroupName: `/aws/lambda/${this.functionName}`,
      retention: 7
    });
  }

  /**
   * Calls addToRolePolicy for every existing WegmansLambda, AND saves the statement to call it for every future WegmansLambda.
   * @param statement
   */
  static addToAllRolePolicies(statement: iam.PolicyStatement) {
    // TODO: validate that it's not already in there
    WegmansLambda.rolePolicyStatements.push(statement);

    WegmansLambda.wegmansLambdas.forEach(element => {
      element.addToRolePolicy(statement);
    });
  }
}

class QueueAndWorker {
  private _queue: sqs.Queue;
  get queue(): sqs.Queue {
    return this._queue;
  }

  private _worker: lambda.Function;
  get worker(): lambda.Function {
    return this._worker;
  }

  constructor(
    scope: cdk.Stack,
    props: {
      workType: WorkType;
      environment: { [key: string]: string };
    }
  ) {
    const functionName = config.get("aws.lambda.functionNames.cdk-wegmans-worker-prefix") + props.workType;
    const lambdaId = `WegmansWorkerLambda${props.workType}`;

    this._queue = new sqs.Queue(scope, `WegmansWorkerQueue${props.workType}`, {
      queueName: config.get("aws.sqs.queueNames.worker-queue-prefix") + props.workType
    });

    new LogGroup(scope, lambdaId + "Logs", {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: RetentionDays.ONE_WEEK
    });

    this._worker = new lambda.Function(scope, lambdaId, {
      runtime: lambda.Runtime.NODEJS_10_X,
      code: buildAsset,
      functionName,
      handler: `dist/lambda/workers/${props.workType}.handler`,
      timeout: Duration.seconds(30),
      environment: props.environment
    });
    this._worker.addEventSource(new SqsEventSource(this._queue));
  }
}

export function addCorsOptions(apiResource: apigw.IResource) {
  apiResource.addMethod(
    "OPTIONS",
    new apigw.MockIntegration({
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers":
              "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Credentials": "'false'",
            "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,GET,PUT,POST,DELETE'"
          }
        }
      ],
      passthroughBehavior: apigw.PassthroughBehavior.NEVER,
      requestTemplates: {
        "application/json": '{"statusCode": 200}'
      }
    }),
    {
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers": true,
            "method.response.header.Access-Control-Allow-Methods": true,
            "method.response.header.Access-Control-Allow-Credentials": true,
            "method.response.header.Access-Control-Allow-Origin": true
          }
        }
      ]
    }
  );
}
