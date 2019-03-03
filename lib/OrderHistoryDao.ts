import * as AWS from "aws-sdk";
import { logger } from "../lib/Logger";
export const TABLENAME_ORDERHISTORYBYUSER = "OrderHistoryByUser";
import { DateTime } from 'luxon';
import { AttributeMap, DescribeTableOutput } from "aws-sdk/clients/dynamodb";
import { AccessToken } from "../models/AccessToken";
import { config } from "./config";
import { DynamoDao } from "./DynamoDao";
import { OrderedProduct, OrderedProductForDynamo } from "../models/OrderedProduct";
import { Product } from "../models/Product";
import * as _ from 'lodash';

AWS.config.update({
  region: "us-east-1",
});

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

interface OrderHistoryItem {
  orderedProducts: OrderedProductForDynamo[];
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

  tableParams: AWS.DynamoDB.CreateTableInput[] = [
    params_OrderHistoryByUser,
  ];

  async delete(userId: string) {
    await this.docClient.delete({
      TableName: TABLENAME_ORDERHISTORYBYUSER,
      Key: {
        userId,
      },
    }).promise();
  }

  async get(userId: string): Promise<{ orderedProducts: OrderedProduct[], lastCachedMillisSinceEpoch: number } | null> {
    await this.initTables();
    const orderedProductsResult = await this.docClient.get({
      Key: {
        userId,
      },
      TableName: TABLENAME_ORDERHISTORYBYUSER,
    }).promise();

    if (orderedProductsResult.Item) {
      const itemOrderedProducts = orderedProductsResult.Item.orderedProducts as OrderedProductForDynamo[];

      return {
        orderedProducts: itemOrderedProducts.map(i => {
          const product: Product | undefined = i.product && { // Dynamo doesn't allow empty strings, so when we're creating OrderedProducts from dynamo entries, we gotta re-vivify the emptystrings
            brand: i.product.brand || "",
            category: i.product.category || "",
            department: i.product.department || "",
            details: i.product.details || "",
            name: i.product.name || "",
            productLine: i.product.productLine || "",
            sku: i.product.sku!,
            subcategory: i.product.subcategory || "",
          };
          return {
            ...i,
            product
          };
      }),
      lastCachedMillisSinceEpoch: orderedProductsResult.Item.endDateMsSinceEpoch as number,
      };
  }
    else {
  return null;
}
  }

async getLastSavedEpochMillis(userId: string) {
  await this.initTables();
  const endDateResult = await this.docClient.get({
    Key: {
      userId,
    },
    ProjectionExpression: "endDateMsSinceEpoch",
    TableName: TABLENAME_ORDERHISTORYBYUSER,
  }).promise();

  const endDateMsSinceEpoch = (endDateResult.Item && endDateResult.Item.endDateMsSinceEpoch);

  return endDateMsSinceEpoch as number;
}

async put(username: string, item: OrderedProduct[], freshAsOfEpochMs = DateTime.utc().valueOf()): Promise < void> {
  await this.initTables();

  // Strip out any empty-string values because dynamo sucks
  const cleanOrderedProducts = item.map(rawOp => { //TODO: not 'any' type
    const product: Product = {
      brand: rawOp.product!.brand,
      category: rawOp.product!.category,
      department: rawOp.product!.department,
      details: rawOp.product!.details,
      name: rawOp.product!.name,
      productLine: rawOp.product!.productLine,
      sku: rawOp.product!.sku,
      subcategory: rawOp.product!.subcategory,
    };
    const cleanOorderedProduct = {
      ...rawOp,
      product: _.omitBy(product, (val) => !val),
    };
    return cleanOorderedProduct;
  });

  const dbItem: OrderHistoryItem = {
    endDateMsSinceEpoch: freshAsOfEpochMs,
    orderedProducts: cleanOrderedProducts,
    userId: username
  };

  await this.docClient.put({
    Item: dbItem,
    TableName: TABLENAME_ORDERHISTORYBYUSER,
  }).promise();
  return;
}
}

export const orderHistoryDao = OrderHistoryDao.getInstance(config.get("aws.dynamodb.endpoint"));
