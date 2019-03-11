import * as AWS from "aws-sdk";
export const TABLENAME_TOKENSBYCODE = "WegmansTokensByAccessCode";
export const TABLENAME_TOKENSBYACCESS = "WegmansTokensByAccessToken";
export const TABLENAME_TOKENSBYREFRESH = "WegmansTokensByRefreshToken";
import { AccessToken } from "../models/AccessToken";
import { config } from "./config";
import { DynamoDao } from "./DynamoDao";

AWS.config.update({
  region: "us-east-1",
});

//TODO: clean out tables periodically
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

const params_TokensByAccessToken: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_TOKENSBYACCESS,
  KeySchema: [
    { AttributeName: "access", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [
    { AttributeName: "access", AttributeType: "S" },
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

class AccessCodeDao extends DynamoDao {

  async getAllAccessTokens(): Promise<AccessToken[]> {
    const dbTokens = await this.docClient.scan({
      TableName: TABLENAME_TOKENSBYACCESS,
    }).promise();
    return dbTokens.Items as AccessToken[];
  }

  async deleteRefreshCode(refresh: string): Promise<void> {
    await this.docClient.delete({
      TableName: TABLENAME_TOKENSBYREFRESH,
      Key: { refresh },
    }).promise();
  }

  async deleteAccess(access: string): Promise<void> {
    await this.docClient.delete({
      TableName: TABLENAME_TOKENSBYACCESS,
      Key: { access },
    }).promise();
  }

  static getInstance(endpoint: string): AccessCodeDao {
    if (!AccessCodeDao._instance) {
      AccessCodeDao._instance = new AccessCodeDao(endpoint);
    }
    return AccessCodeDao._instance;
  }
  private static _instance: AccessCodeDao;

  tableParams: AWS.DynamoDB.CreateTableInput[] = [
    params_TokensByCode,
    params_TokensByRefresh,
    params_TokensByAccessToken
  ];

  async getTokensByCode(code: string): Promise<AccessToken> {
    const dbTokens = await this.docClient.get({
      Key: {
        access_code: code,
      },
      TableName: TABLENAME_TOKENSBYCODE,
    }).promise();

    return Promise.resolve(dbTokens.Item as AccessToken);
  }

  async getTokensByAccess(access: string): Promise<AccessToken> {
    const dbTokens = await this.docClient.get({
      Key: { access },
      TableName: TABLENAME_TOKENSBYACCESS,
    }).promise();

    return Promise.resolve(dbTokens.Item as AccessToken);
  }

  async getTokensByRefresh(refreshToken: string): Promise<AccessToken> {
    const dbTokens = await this.docClient.get({
      Key: {
        refresh: refreshToken,
      },
      TableName: TABLENAME_TOKENSBYREFRESH,
    }).promise();

    return Promise.resolve(dbTokens.Item as AccessToken);
  }

  async put(item: AccessToken): Promise<void> {
    const tokensByCodePromise = item.access_code ? this.docClient.put({
      Item: item,
      TableName: TABLENAME_TOKENSBYCODE,
    }).promise().then(() => { }) : Promise.resolve();

    const tokensByRefreshTokenPromise = this.docClient.put({
      Item: item,
      TableName: TABLENAME_TOKENSBYREFRESH,
    }).promise();

    const tokensByAccessTokenPromise = this.docClient.put({
      Item: item,
      TableName: TABLENAME_TOKENSBYACCESS
    }).promise();

    return Promise.all([tokensByRefreshTokenPromise, tokensByCodePromise, tokensByAccessTokenPromise]).then(() => { });
  }

  async deleteAccessCode(access_code: string): Promise<void> {
    const result = await this.docClient.delete({
      TableName: TABLENAME_TOKENSBYCODE,
      Key: { access_code },
    }).promise();

    return;
  }
}

export const accessCodeDao = AccessCodeDao.getInstance(config.get("aws.dynamodb.endpoint"));
