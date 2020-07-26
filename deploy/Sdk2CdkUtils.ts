import cdk = require("@aws-cdk/core");
import * as dynamo from "@aws-cdk/aws-dynamodb";
import { RemovalPolicy } from "@aws-cdk/core/lib/removal-policy";
import { CreateTableInput, DescribeTableOutput } from "aws-sdk/clients/dynamodb";

type Sdk2CdkConverter<S, C> = (input: S) => C;

const dynamoTableConverter: Sdk2CdkConverter<CreateTableInput, dynamo.TableProps> = (input) => {
  const partitionKeyName = input.KeySchema.find((att) => att.KeyType === "HASH")!.AttributeName;
  const partitionKeyType = (() => {
    const attType = input.AttributeDefinitions.find((att) => att.AttributeName === partitionKeyName)!.AttributeType;
    switch (attType) {
      case "S":
        return dynamo.AttributeType.STRING;
      default:
        throw new Error(`Can't parse dynamo attribute type: '${attType}'`);
    }
  })();

  return {
    partitionKey: {
      name: partitionKeyName,
      type: partitionKeyType,
    },
    tableName: input.TableName,
    billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.DESTROY,
  };
};

export function dynamoTablesFromSdk(
  scope: cdk.Construct,
  tableParams: Array<{ tableParams: CreateTableInput; resourceName?: string }>
): dynamo.Table[] {
  return tableParams.map(
    ({ tableParams, resourceName }) =>
      new dynamo.Table(scope, resourceName || tableParams.TableName, dynamoTableConverter(tableParams))
  );
}
