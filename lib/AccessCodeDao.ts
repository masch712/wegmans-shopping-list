import { logger } from '../lib/Logger';
import * as AWS from 'aws-sdk';
const TABLENAME_TOKENSBYCODE = 'WegmansAccessByCode';
const TABLENAME_TOKENSBYREFRESH = 'WegmansAccessByRefresh';
const BATCH_GET_SIZE = 100;
const BATCH_PUT_SIZE = 25;
const { DateTime } = require('luxon');
import { AttributeMap } from "aws-sdk/clients/dynamodb";
import { AccessToken } from '../models/AccessToken';
import config from "./config";
//TODO: is tihs necessary?
AWS.config.update({
  region: 'us-east-1',
});


const params_TokensByCode: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_TOKENSBYCODE,
  KeySchema: [
    { AttributeName: 'access_code', KeyType: 'HASH' }, // Partition key
  ],
  AttributeDefinitions: [
    { AttributeName: 'access_code', AttributeType: 'S' },
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

const params_TokensByRefresh: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME_TOKENSBYREFRESH,
  KeySchema: [
    { AttributeName: 'refresh', KeyType: 'HASH' }, // Partition key
  ],
  AttributeDefinitions: [
    { AttributeName: 'refresh', AttributeType: 'S' },
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

class AccessCodeDao {

  private static _instance: AccessCodeDao;
  private dynamodb: AWS.DynamoDB;
  private docClient;// = new AWS.DynamoDB.DocumentClient(connParams);

  apiKey: string;

  constructor(private endpoint: string) {
    if (AccessCodeDao._instance) {
      throw new Error('Singleton already instantiated');
    }
    const options = endpoint ? { endpoint } : undefined;
    logger.debug(`options: ` + JSON.stringify(options));
    this.dynamodb = new AWS.DynamoDB(options);
    this.docClient = new AWS.DynamoDB.DocumentClient(options);
  }

  public static getInstance(endpoint?: string): AccessCodeDao {
    if (!AccessCodeDao._instance) {
      AccessCodeDao._instance = new AccessCodeDao(endpoint);
    }
    return AccessCodeDao._instance;
  }

  private async tableExists(tableName = TABLENAME_TOKENSBYCODE): Promise<Boolean> {
    logger.debug('describing table ' + tableName);
    return this.dynamodb.describeTable(
      {
        TableName: tableName,
      }
    ).promise()
      .then((data) => {
        logger.debug('got table');
        return data.Table != null;
      })
      .catch((err) => {
        // TODO: parse the error?
        return false;
      });
  }

  async getTokensByCode(code: string): Promise<AccessToken> {
    const dbTokens = await this.docClient.get({
      TableName: TABLENAME_TOKENSBYCODE,
      Key: {
        access_code: code,
      },
    }).promise();

    return Promise.resolve(dbTokens.Item as AccessToken);
  }

  async getTokensByRefresh(refreshToken: string): Promise<AccessToken> {
    const dbTokens = await this.docClient.get({
      TableName: TABLENAME_TOKENSBYREFRESH,
      Key: {
        refresh: refreshToken,
      },
    }).promise();

    return Promise.resolve(dbTokens.Item as AccessToken);
  }

  async dropTable(tableName) {
    const promise = new Promise((resolve, reject) => {
      this.dynamodb.deleteTable({
        TableName: tableName,
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    return promise;
  }

  async dropTables() {
    return Promise.all([
      this.dropTable(TABLENAME_TOKENSBYCODE),
      this.dropTable(TABLENAME_TOKENSBYREFRESH),
    ]);
  }

  private async createTable(tableName = TABLENAME_TOKENSBYCODE) {
    const promise = new Promise((resolve, reject) => {
      this.dynamodb.createTable(params_TokensByCode, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    return promise;
  }

  async initTables() {
    logger.debug('initting tables');
    const tablesAndSchemas = {
      [TABLENAME_TOKENSBYCODE]: params_TokensByCode,
      [TABLENAME_TOKENSBYREFRESH]: params_TokensByRefresh,
    };

    const tableNames = Object.keys(tablesAndSchemas);

    let tableExists: { [key: string]: Boolean } = {};
    for (let i = 0; i < tableNames.length; i++) {
      tableExists[tableNames[i]] = await this.tableExists(tableNames[i]);
    }

    //TODO: why do i need this?
    const self = this;
    const promises = tableNames.map((tableName) => {
      logger.debug(tableName);
      if (!tableExists[tableName]) {
        logger.debug('create table ' + tableName);
        return self.dynamodb.createTable(tablesAndSchemas[tableName]).promise().then(() => {
          logger.debug(`${tableName} created`);
        });
      }
      return Promise.resolve();
    });

    await Promise.all(promises);

    return;
  }

  async put(item: AccessToken): Promise<void> {
    const tokensByCodePromise = item.access_code ? this.docClient.put({
      TableName: TABLENAME_TOKENSBYCODE,
      Item: item,
    }).promise() : Promise.resolve();

    const tokensByRefreshTokenPromise = this.docClient.put({
      TableName: TABLENAME_TOKENSBYREFRESH,
      Item: item,
    }).promise();

    return Promise.all([tokensByRefreshTokenPromise, tokensByCodePromise]).then(() => { });
  }
}

export const accessCodeDao = AccessCodeDao.getInstance(config.get('aws.dynamodb.endpoint'));