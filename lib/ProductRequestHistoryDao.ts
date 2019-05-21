import * as AWS from "aws-sdk";
import { config } from "./config";
import { DynamoDao } from "./DynamoDao";
import { Product } from "../models/Product";
import * as _ from 'lodash';
export const TABLENAME_PRODUCTREQUESTHISTORY = config.get('aws.dynamodb.tableNames.PRODUCTREQUESTHISTORY');

AWS.config.update({
  region: "us-east-1",
});

const params_ProductRequestHistory: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_PRODUCTREQUESTHISTORY,
  KeySchema: [
    { AttributeName: "user_query", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [
    { AttributeName: "user_query", AttributeType: "S" },
  ],
  BillingMode: 'PAY_PER_REQUEST'
};

const USER_QUERY_DELIMITER = "::";

interface ProductRequestHistoryItem {
  chosenProduct: Partial<Product>;
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

  tableParams: AWS.DynamoDB.CreateTableInput[] = [
    params_ProductRequestHistory,
  ];

  async get(userId: string, query: string) {
    await this.initTables();
    const requestHistoryResult = await this.docClient.get({
      Key: {
        user_query: getUserQuery(userId, query),
      },
      TableName: TABLENAME_PRODUCTREQUESTHISTORY,
    }).promise();

    const i = requestHistoryResult.Item as ProductRequestHistoryItem | undefined;

    if (!i) {
      return null;
    }

    const chosenProduct: Product | undefined = i.chosenProduct && { // Dynamo doesn't allow empty strings, so when we're creating OrderedProducts from dynamo entries, we gotta re-vivify the emptystrings
      brand: i.chosenProduct.brand || "",
      category: i.chosenProduct.category || "",
      department: i.chosenProduct.department || "",
      details: i.chosenProduct.details || "",
      name: i.chosenProduct.name || "",
      productLine: i.chosenProduct.productLine || "",
      sku: i.chosenProduct.sku!,
      subcategory: i.chosenProduct.subcategory || "",
    };
    return {
      ...i,
      chosenProduct
    };
  }

  async put(username: string, query: string, chosenProduct: Product) {
    await this.initTables();

    // Strip out any empty-string values because dynamo sucks
    const cleanProduct = _.omitBy(chosenProduct, (val) => !val);

    const dbItem: ProductRequestHistoryItem = {
      user_query: getUserQuery(username, query),
      chosenProduct: cleanProduct,
      lastRequestDateEpoch: new Date().valueOf(),
    };

    await this.docClient.put({
      Item: dbItem,
      TableName: TABLENAME_PRODUCTREQUESTHISTORY,
    }).promise();
    return;
  }
}

export const productRequestHistoryDao = ProductRequestHistoryDao.getInstance(config.get("aws.dynamodb.endpoint"));
