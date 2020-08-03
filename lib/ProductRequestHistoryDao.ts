import * as AWS from "aws-sdk";
import { config } from "./config";
import { DynamoDao } from "./DynamoDao";
import * as _ from "lodash";
import { StoreProductItem } from "../models/StoreProductItem";
export const TABLENAME_PRODUCTREQUESTHISTORY = config.get("aws.dynamodb.tableNames.PRODUCTREQUESTHISTORY");

AWS.config.update({
  region: "us-east-1",
});

export const tableProductRequestHistory: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_PRODUCTREQUESTHISTORY,
  KeySchema: [
    { AttributeName: "user_query", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [{ AttributeName: "user_query", AttributeType: "S" }],
  BillingMode: "PAY_PER_REQUEST",
};

const USER_QUERY_DELIMITER = "::";

interface ProductRequestHistoryItem {
  chosenProduct: StoreProductItem;
  lastRequestDateEpoch: number;
  user_query: string;
}

function getUserQuery(username: string, query: string) {
  return `${username}${USER_QUERY_DELIMITER}${query}`;
}

class ProductRequestHistoryDao extends DynamoDao {
  static getInstance(endpoint: string): ProductRequestHistoryDao {
    if (!ProductRequestHistoryDao._instance) {
      ProductRequestHistoryDao._instance = new ProductRequestHistoryDao(endpoint);
    }
    return ProductRequestHistoryDao._instance;
  }
  private static _instance: ProductRequestHistoryDao;

  tableParams: AWS.DynamoDB.CreateTableInput[] = [tableProductRequestHistory];

  async get(userId: string, query: string) {
    await this.initTables();
    const requestHistoryResult = await this.makeCancellable(
      this.docClient.get({
        Key: {
          user_query: getUserQuery(userId, query),
        },
        TableName: TABLENAME_PRODUCTREQUESTHISTORY,
      })
    ).promise();

    const i = requestHistoryResult.Item as ProductRequestHistoryItem | undefined;

    if (!i) {
      return null;
    }

    const chosenProduct = i.chosenProduct;
    return {
      ...i,
      chosenProduct,
    };
  }

  async put(username: string, query: string, chosenProduct: StoreProductItem) {
    await this.initTables();

    const dbItem: ProductRequestHistoryItem = {
      user_query: getUserQuery(username, query),
      chosenProduct,
      lastRequestDateEpoch: new Date().valueOf(),
    };

    await this.docClient
      .put({
        Item: dbItem,
        TableName: TABLENAME_PRODUCTREQUESTHISTORY,
      })
      .promise();
    return;
  }
}

export const productRequestHistoryDao = ProductRequestHistoryDao.getInstance(config.get("aws.dynamodb.endpoint"));
