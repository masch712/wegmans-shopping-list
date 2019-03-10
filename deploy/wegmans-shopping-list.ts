import cdk = require('@aws-cdk/cdk');
import * as lambda from "@aws-cdk/aws-lambda";
import * as apigw from '@aws-cdk/aws-apigateway';
import * as dynamo from '@aws-cdk/aws-dynamodb';
import { TABLENAME_TOKENSBYACCESS, TABLENAME_TOKENSBYCODE, TABLENAME_TOKENSBYREFRESH } from '../lib/AccessCodeDao';
import { PolicyStatement, PolicyStatementEffect } from '@aws-cdk/aws-iam';
import { TABLENAME_ORDERHISTORYBYUSER } from '../lib/OrderHistoryDao';

export class WegmansCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const skillLambda = new WegmansLambda(this, 'AlexaLambdaWegmansShoppingList', {
      handler: 'dist/lambda/alexa/index.handler',
      functionName: 'cdk-wegmans-shopping-list',
      environment: {
        AWS_ENCRYPTED: 'true',
        LOGGING_LEVEL: 'debug',
        LOGICAL_ENV: 'development-aws',
        WEGMANS_APIKEY: 'AQICAHhEbkp592DXQD2+erIwWGqDeHoUQnAaX1Sw+4YW0087HwH8RXX/AbEVLZkJKaecLtodAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMiKCMxebwomihAFKIAgEQgDuufhAPULVlpHYsEhxt0lMSrTLLWkQ9Oo1aPWEp16Orm4kvVkGYjgiBn/LAGxpu3MELznE3cqPFDletuA==',
      }
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

    skillLambda.addToRolePolicy(dynamoAccessPolicy);
    authServerLambdaGenerateAccessCode.addToRolePolicy(dynamoAccessPolicy);
    authServerLambdaGetTokens.addToRolePolicy(dynamoAccessPolicy);
  }
}

class WegmansLambda extends lambda.Function {
  constructor(scope: cdk.Stack, id: string, props: {
    handler: string,
    functionName: string,
    environment?:  { [key: string]: string } // NOTE: FunctionProps.environment can supposedly have 'any' values, but cdk deploy fails if you give non-string values
  }) {
    super(scope, id, {
      runtime: lambda.Runtime.NodeJS810,
      handler: props.handler,
      code: lambda.Code.asset('./build/build.zip'),
      functionName: props.functionName,
      environment: props.environment || {},
      timeout: 30,
    });
  }
}

// export function ship() {
//   new WegmansCdkStack(cdk.App., 
// }