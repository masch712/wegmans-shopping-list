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
  tableTokensByAccessToken,
  tableTokensByRefresh,
  tableTokensByCode,
  tablePreRefreshedTokensByRefresh
} from "../lib/AccessCodeDao";
import { PolicyStatement, Effect } from "@aws-cdk/aws-iam";
import { tableOrderHistoryByUser } from "../lib/OrderHistoryDao";
import { WorkType } from "../lib/BasicAsyncQueue";
import { config } from "../lib/config";
import { TABLENAME_PRODUCTREQUESTHISTORY, tableProductRequestHistory } from "../lib/ProductRequestHistoryDao";
import { getWorkType as addToShoppingListWorkType } from "../lambda/workers/AddToShoppingList";
import { getWorkType as searchThenAddToShoppingListWorkType } from "../lambda/workers/SearchThenAddToShoppingList";
import { LogGroup, RetentionDays } from "@aws-cdk/aws-logs";
import { Duration } from "@aws-cdk/core";
import { Schedule } from "@aws-cdk/aws-events";
import { dynamoTablesFromSdk } from "./Sdk2CdkUtils";

const buildAsset = lambda.Code.asset("./build/build.zip");
console.log(searchThenAddToShoppingListWorkType);
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
        "AQICAHhEbkp592DXQD2+erIwWGqDeHoUQnAaX1Sw+4YW0087HwH8RXX/AbEVLZkJKaecLtodAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMiKCMxebwomihAFKIAgEQgDuufhAPULVlpHYsEhxt0lMSrTLLWkQ9Oo1aPWEp16Orm4kvVkGYjgiBn/LAGxpu3MELznE3cqPFDletuA==",
      // NOTE: JWT_SECRET is also encrypted by the KMS key.
      JWT_SECRET:
        "AQICAHhEbkp592DXQD2+erIwWGqDeHoUQnAaX1Sw+4YW0087HwFOF1D9M1diLlRWMb1PS3XuAAAAmDCBlQYJKoZIhvcNAQcGoIGHMIGEAgEAMH8GCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMV+3jRLKnRmug6MZEAgEQgFKhpuItrd7C+MdllHuuRJGHivEJ7m1GYHyo7875PMNOWHnjVwqIPNhP/ExPXu1clT8nEXqxBFnhH5tvh/i+psRVgjN5nWPNvPo4MCMbsCYQiU0M"
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
    const dynamoOrderHistoryTables = dynamoTablesFromSdk(this, [
      {
        tableParams: tableOrderHistoryByUser,
        resourceName: "WegmansDynamoOrderHistoryByUser" // TODO: dont need custom resourcenames anymore because tablenames match resourcenames
      }
    ]);
    const dynamoTokensTables = dynamoTablesFromSdk(this, [
      {
        tableParams: tableTokensByAccessToken,
        resourceName: "WegmansTokensByAccessToken"
      },
      {
        tableParams: tableTokensByRefresh,
        resourceName: "WegmansTokensByRefreshToken"
      },
      {
        tableParams: tableTokensByCode,
        resourceName: "WegmansTokensByAccessCode"
      },
      {
        tableParams: tablePreRefreshedTokensByRefresh,
        resourceName: "WegmansPreRefreshedTokens"
      }
    ]);
    const dynamoProductRequestHistoryTables = dynamoTablesFromSdk(this, [
      {
        tableParams: tableProductRequestHistory,
        resourceName: "WegmansDynamoProductRequestHistory"
      }
    ]);
    //TODO: delete the dynamo autoscaling alarms in cloudwatch, they cost like $3.20 a month

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
        ...dynamoTokensTables.map(t => t.tableArn),
        ...dynamoProductRequestHistoryTables.map(t => t.tableArn)
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
    const queueAndWorkers: { [workTypeName: string]: QueueAndWorker } = {};
    //TODO: instead of listing out workers here, have a registerWorkType() function that runs at import time (i..e at top level of worker module) and registers to some "global" exported array in the BasicAsyncQueue module
    for (const getWorkType of [addToShoppingListWorkType, searchThenAddToShoppingListWorkType]) {
      const queueAndWorker = new QueueAndWorker(this, {
        workType: getWorkType(),
        environment
      });
      queueAndWorkers[getWorkType().name] = queueAndWorker;

      // Every worker can do anything with kms, dynamo, and other workers
      queueAndWorker.worker.addToRolePolicy(kmsPolicy);
      queueAndWorker.worker.addToRolePolicy(dynamoAccessPolicy);

      // Workers an enqueue to the workers they declare (least privilege and whatnot)
      console.log("******");
      console.log(getWorkType());
      console.log(queueAndWorkers);
      getWorkType().enqueuesTo.length &&
        queueAndWorker.worker.addToRolePolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sqs:SendMessage"],
            resources: getWorkType()
              .enqueuesTo.map(enqueuesToWorkType => queueAndWorkers[enqueuesToWorkType.name])
              .map(qAndW => qAndW.queue.queueArn)
          })
        );
    }

    const enqueuerPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["sqs:SendMessage"],
      resources: Object.keys(queueAndWorkers)
        .sort()
        .map(workTypeName => queueAndWorkers[workTypeName].queue.queueArn)
    });

    // Every WegmansLambda (eg. alexa handler, auth handlers) can do anything with dynamo.... :-/
    // TODO: the workers should EXCLUSIVELY call APIs, not call directly to the database?
    // TODO: only the alexa lambda needs to call the workers, not the auth lambdas.  least privilege dammit!
    WegmansLambda.wegmansLambdas.forEach(wl => wl.addToRolePolicy(enqueuerPolicy));

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

    new cdk.CfnOutput(this, "TestSkillCli", {
      value: `ask simulate --skill-id ${config.get("alexa.skill.id")} --locale en-US --text "ask ${config.get(
        "alexa.skill.utterance"
      )} for some bananas"`,
      description: "Command to run to test the skill"
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
    const functionName = config.get("aws.lambda.functionNames.cdk-wegmans-worker-prefix") + props.workType.name;
    const lambdaId = `WegmansWorkerLambda${props.workType.name}`;

    this._queue = new sqs.Queue(scope, `WegmansWorkerQueue${props.workType.name}`, {
      queueName: config.get("aws.sqs.queueNames.worker-queue-prefix") + props.workType.name
    });

    new LogGroup(scope, lambdaId + "Logs", {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: RetentionDays.ONE_WEEK
    });

    this._worker = new lambda.Function(scope, lambdaId, {
      runtime: lambda.Runtime.NODEJS_10_X,
      code: buildAsset,
      functionName,
      handler: `dist/lambda/workers/${props.workType.name}.handler`,
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
