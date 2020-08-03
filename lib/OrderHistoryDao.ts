import * as AWS from "aws-sdk";
import { DateTime } from "luxon";
import { config } from "./config";
import { DynamoDao } from "./DynamoDao";
import * as _ from "lodash";
import { StoreProductItem } from "../models/StoreProductItem";
export const TABLENAME_ORDERHISTORYBYUSER = config.get("aws.dynamodb.tableNames.ORDERHISTORYBYUSER");

AWS.config.update({
  region: "us-east-1",
});

export interface OrderHistoryItem {
  purchaseMsSinceEpoch: number;
  quantity: number;
  storeProduct: StoreProductItem;
}

export const tableOrderHistoryByUser: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_ORDERHISTORYBYUSER,
  KeySchema: [
    { AttributeName: "userId", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
  BillingMode: "PAY_PER_REQUEST",
};

interface OrderHistoryTableRow {
  orderedItems: OrderHistoryItem[];
  endDateMsSinceEpoch: number;
  userId: string;
}

class OrderHistoryDao extends DynamoDao {
  static getInstance(endpoint: string): OrderHistoryDao {
    if (!OrderHistoryDao._instance) {
      OrderHistoryDao._instance = new OrderHistoryDao(endpoint);
    }
    return OrderHistoryDao._instance;
  }
  private static _instance: OrderHistoryDao;

  tableParams: AWS.DynamoDB.CreateTableInput[] = [tableOrderHistoryByUser];

  async delete(userId: string) {
    await this.initTables();
    await this.docClient
      .delete({
        TableName: TABLENAME_ORDERHISTORYBYUSER,
        Key: {
          userId,
        },
      })
      .promise();
  }

  async get(userId: string): Promise<OrderHistoryTableRow | null> {
    await this.initTables();
    const orderedProductsResult = await this.makeCancellable(
      this.docClient.get({
        Key: {
          userId,
        },
        TableName: TABLENAME_ORDERHISTORYBYUSER,
      })
    ).promise();

    if (orderedProductsResult.Item) {
      const row = orderedProductsResult.Item as OrderHistoryTableRow;
      // TODO: Item seems to be a Map.  Is that ok?
      return row;
    } else {
      return null;
    }
  }

  async getLastSavedEpochMillis(userId: string) {
    await this.initTables();
    const endDateResult = await this.docClient
      .get({
        Key: {
          userId,
        },
        ProjectionExpression: "endDateMsSinceEpoch",
        TableName: TABLENAME_ORDERHISTORYBYUSER,
      })
      .promise();

    const endDateMsSinceEpoch = endDateResult.Item && endDateResult.Item.endDateMsSinceEpoch;

    return endDateMsSinceEpoch as number;
  }

  async put(row: OrderHistoryTableRow): Promise<void> {
    await this.initTables();

    await this.docClient
      .put({
        Item: row,
        TableName: TABLENAME_ORDERHISTORYBYUSER,
      })
      .promise();
    return;
  }
}

export const orderHistoryDao = OrderHistoryDao.getInstance(config.get("aws.dynamodb.endpoint"));
