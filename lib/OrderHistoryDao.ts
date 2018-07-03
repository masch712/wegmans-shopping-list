import * as AWS from "aws-sdk";
import { logger } from "../lib/Logger";
export const TABLENAME_ORDERHISTORYBYUSER = "OrderHistoryByUser";
import { DateTime } from 'luxon';
import { AttributeMap, DescribeTableOutput } from "aws-sdk/clients/dynamodb";
import { AccessToken } from "../models/AccessToken";
import { config } from "./config";
import { DynamoDao } from "./DynamoDao";
import { OrderedProduct } from "../models/OrderedProduct";

AWS.config.update({
  region: "us-east-1",
});
// TODO: salt the access code?
const params_OrderHistoryByUser: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_ORDERHISTORYBYUSER,
  KeySchema: [
    { AttributeName: "userId", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [
    { AttributeName: "userId", AttributeType: "S" },
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

class OrderHistoryItem {
  constructor(
    public orderedProducts: OrderedProduct[],
    public endDateMsSinceEpoch: number,
    public userId: string,
  ) { }
}

class OrderHistoryDao extends DynamoDao {
  static getInstance(endpoint?: string): OrderHistoryDao {
    if (!OrderHistoryDao._instance) {
      OrderHistoryDao._instance = new OrderHistoryDao(endpoint);
    }
    return OrderHistoryDao._instance;
  }
  private static _instance: OrderHistoryDao;

  tableParams: AWS.DynamoDB.CreateTableInput[] = [
    params_OrderHistoryByUser,
  ];
  apiKey: string;


  async get(userId: string): Promise<OrderedProduct[]> {
    await this.initTables();
    const orderedProductsResult = await this.docClient.get({
      Key: {
        userId,
      },
      TableName: TABLENAME_ORDERHISTORYBYUSER,
    }).promise();

    const itemOrderedProducts = (orderedProductsResult.Item && orderedProductsResult.Item.orderedProducts);

    return itemOrderedProducts as OrderedProduct[];
  }

  async put(username: string, item: OrderedProduct[], freshAsOfEpochMs = DateTime.utc().valueOf()): Promise<void> {
    await this.initTables();
    const dbItem = new OrderHistoryItem(item, freshAsOfEpochMs, username);
    const tokensByRefreshTokenPromise = await this.docClient.put({
      Item: dbItem,
      TableName: TABLENAME_ORDERHISTORYBYUSER,
    }).promise();
    return;
  }
}

export const orderHistoryDao = OrderHistoryDao.getInstance(config.get("aws.dynamodb.endpoint"));
