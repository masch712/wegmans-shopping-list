import * as AWS from "aws-sdk";
import { logger } from "../lib/Logger";
export const TABLENAME_TOKENSBYCODE = "WegmansAccessByCode";
export const TABLENAME_TOKENSBYREFRESH = "WegmansAccessByRefresh";
const BATCH_GET_SIZE = 100;
const BATCH_PUT_SIZE = 25;
const { DateTime } = require("luxon");
import { AttributeMap, DescribeTableOutput } from "aws-sdk/clients/dynamodb";
import { AccessToken } from "../models/AccessToken";
import config from "./config";
import { DynamoDao } from "./DynamoDao";

AWS.config.update({
  region: "us-east-1",
});
// TODO: salt the access code?
const params_TokensByCode: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_TOKENSBYCODE,
  KeySchema: [
    { AttributeName: "access_code", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [
    { AttributeName: "access_code", AttributeType: "S" },
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

const params_TokensByRefresh: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_TOKENSBYREFRESH,
  KeySchema: [
    { AttributeName: "refresh", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [
    { AttributeName: "refresh", AttributeType: "S" },
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

class AccessCodeDao extends DynamoDao {
  
  public static getInstance(endpoint?: string): AccessCodeDao {
    if (!AccessCodeDao._instance) {
      AccessCodeDao._instance = new AccessCodeDao(endpoint);
    }
    return AccessCodeDao._instance;
  }
  private static _instance: AccessCodeDao;
  
              public tableParams: AWS.DynamoDB.CreateTableInput[] = [
                params_TokensByCode,
                params_TokensByRefresh,
              ];
  public apiKey: string;


  public async getTokensByCode(code: string): Promise<AccessToken> {
    const dbTokens = await this.docClient.get({
      Key: {
        access_code: code,
      },
      TableName: TABLENAME_TOKENSBYCODE,
    }).promise();

    return Promise.resolve(dbTokens.Item as AccessToken);
  }

  public async getTokensByRefresh(refreshToken: string): Promise<AccessToken> {
    const dbTokens = await this.docClient.get({
      Key: {
        refresh: refreshToken,
      },
      TableName: TABLENAME_TOKENSBYREFRESH,
    }).promise();

    return Promise.resolve(dbTokens.Item as AccessToken);
  }

  public async put(item: AccessToken): Promise<void> {
    const tokensByCodePromise = item.access_code ? this.docClient.put({
      Item: item,
      TableName: TABLENAME_TOKENSBYCODE,
    }).promise().then(() => {}) : Promise.resolve();

    const tokensByRefreshTokenPromise = this.docClient.put({
      Item: item,
      TableName: TABLENAME_TOKENSBYREFRESH,
    }).promise().then();

    await Promise.all([tokensByRefreshTokenPromise, tokensByCodePromise]).then(() => { });
  }

  public async deleteAccessCode(access_code: string): Promise<void> {
    await this.docClient.delete({
      TableName: TABLENAME_TOKENSBYCODE,
      Key: { access_code },
    }).promise();
  }
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(() => resolve(true), time));
}

export const accessCodeDao = AccessCodeDao.getInstance(config.get("aws.dynamodb.endpoint"));
