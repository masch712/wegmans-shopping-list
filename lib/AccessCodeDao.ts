import * as AWS from "aws-sdk";
import { WedgiesOAuthToken, PreRefreshedAccessToken } from "../models/AccessToken";
import { config } from "./config";
import { DynamoDao } from "./DynamoDao";
export const TABLENAME_TOKENSBYCODE = config.get("aws.dynamodb.tableNames.TOKENSBYCODE");
export const TABLENAME_TOKENSBYACCESS = config.get("aws.dynamodb.tableNames.TOKENSBYACCESS");
export const TABLENAME_TOKENSBYREFRESH = config.get("aws.dynamodb.tableNames.TOKENSBYREFRESH");
export const TABLENAME_PREREFRESHEDTOKENSBYREFRESH = config.get("aws.dynamodb.tableNames.PREREFRESHEDTOKENSBYREFRESH");

AWS.config.update({
  region: "us-east-1",
});

//TODO: clean out tables periodically
// TODO: salt the access code?
export const tableTokensByCode: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_TOKENSBYCODE,
  KeySchema: [
    { AttributeName: "authorization_code", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [{ AttributeName: "authorization_code", AttributeType: "S" }],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

export const tableTokensByRefresh: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_TOKENSBYREFRESH,
  KeySchema: [
    { AttributeName: "refresh", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [{ AttributeName: "refresh", AttributeType: "S" }],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

export const tableTokensByAccessToken: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_TOKENSBYACCESS,
  KeySchema: [
    { AttributeName: "access", KeyType: "HASH" }, // Partition key
  ],
  AttributeDefinitions: [{ AttributeName: "access", AttributeType: "S" }],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

export const tablePreRefreshedTokensByRefresh: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_PREREFRESHEDTOKENSBYREFRESH,
  KeySchema: [
    { AttributeName: "refreshed_by", KeyType: "HASH" }, // Partition key; the refresh token that was used to generate these tokens.
  ],
  AttributeDefinitions: [{ AttributeName: "refreshed_by", AttributeType: "S" }],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

export class WedgiesOAuthDao extends DynamoDao {
  async getAllAccessTokens(): Promise<WedgiesOAuthToken[]> {
    const dbTokens = await this.docClient
      .scan({
        TableName: TABLENAME_TOKENSBYACCESS,
      })
      .promise();
    return dbTokens.Items as WedgiesOAuthToken[];
  }

  async deleteRefreshCode(refresh: string): Promise<void> {
    await this.docClient
      .delete({
        TableName: TABLENAME_TOKENSBYREFRESH,
        Key: { refresh },
      })
      .promise();
  }

  async deleteAccess(access: string): Promise<void> {
    await this.docClient
      .delete({
        TableName: TABLENAME_TOKENSBYACCESS,
        Key: { access },
      })
      .promise();
  }

  static getInstance(endpoint: string): WedgiesOAuthDao {
    if (!WedgiesOAuthDao._instance) {
      WedgiesOAuthDao._instance = new WedgiesOAuthDao(endpoint);
    }
    return WedgiesOAuthDao._instance;
  }
  private static _instance: WedgiesOAuthDao;

  tableParams: AWS.DynamoDB.CreateTableInput[] = [
    tableTokensByCode,
    tableTokensByRefresh,
    tableTokensByAccessToken,
    tablePreRefreshedTokensByRefresh,
  ];

  async getTokensByCode(code: string): Promise<WedgiesOAuthToken> {
    const dbTokens = await this.docClient
      .get({
        Key: {
          authorization_code: code,
        },
        TableName: TABLENAME_TOKENSBYCODE,
      })
      .promise();

    return Promise.resolve(dbTokens.Item as WedgiesOAuthToken);
  }

  async getTokensByAccess(access: string): Promise<WedgiesOAuthToken> {
    const dbTokens = await this.docClient
      .get({
        Key: { access },
        TableName: TABLENAME_TOKENSBYACCESS,
      })
      .promise();

    return Promise.resolve(dbTokens.Item as WedgiesOAuthToken);
  }

  async getTokensByRefresh(refreshToken: string): Promise<WedgiesOAuthToken> {
    const dbTokens = await this.docClient
      .get({
        Key: {
          refresh: refreshToken,
        },
        TableName: TABLENAME_TOKENSBYREFRESH,
      })
      .promise();

    return Promise.resolve(dbTokens.Item as WedgiesOAuthToken);
  }

  async getPreRefreshedToken(refreshedByRefreshToken: string) {
    const dbTokens = await this.docClient
      .get({
        Key: {
          refreshed_by: refreshedByRefreshToken,
        },
        TableName: TABLENAME_PREREFRESHEDTOKENSBYREFRESH,
      })
      .promise();
    //TODO: what if no token?  what do we get back from dynamo? what do we return?
    return Promise.resolve(dbTokens.Item as PreRefreshedAccessToken);
  }

  async putPreRefreshedTokens(item: PreRefreshedAccessToken) {
    await this.docClient
      .put({
        Item: item,
        TableName: TABLENAME_PREREFRESHEDTOKENSBYREFRESH,
      })
      .promise();
  }

  async put(item: WedgiesOAuthToken): Promise<void> {
    const tokensByCodePromise = item.authorization_code
      ? this.docClient
          .put({
            Item: item,
            TableName: TABLENAME_TOKENSBYCODE,
          })
          .promise()
          .then(() => {})
      : Promise.resolve();

    const tokensByRefreshTokenPromise = this.docClient
      .put({
        Item: item,
        TableName: TABLENAME_TOKENSBYREFRESH,
      })
      .promise();

    const tokensByAccessTokenPromise = this.docClient
      .put({
        Item: item,
        TableName: TABLENAME_TOKENSBYACCESS,
      })
      .promise();

    return Promise.all([tokensByRefreshTokenPromise, tokensByCodePromise, tokensByAccessTokenPromise]).then(() => {});
  }

  async deleteAuthorizationCode(authorization_code: string): Promise<void> {
    const result = await this.docClient
      .delete({
        TableName: TABLENAME_TOKENSBYCODE,
        Key: { authorization_code },
      })
      .promise();

    return;
  }

  async deletePreRefreshedTokens(refreshed_by: string): Promise<void> {
    await this.docClient
      .delete({
        TableName: TABLENAME_PREREFRESHEDTOKENSBYREFRESH,
        Key: { refreshed_by },
      })
      .promise();

    return;
  }
}

export const accessCodeDao = WedgiesOAuthDao.getInstance(config.get("aws.dynamodb.endpoint"));
