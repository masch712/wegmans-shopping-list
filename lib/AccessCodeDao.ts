import { logger } from '../lib/Logger';
import * as AWS from 'aws-sdk';
const TABLENAME = 'WegmansAccess';
const BATCH_GET_SIZE = 100;
const BATCH_PUT_SIZE = 25;
const {DateTime} = require('luxon');
import { AttributeMap } from "aws-sdk/clients/dynamodb";

//TODO: is tihs necessary?
AWS.config.update({
  region: 'us-east-1',
});


const params: AWS.DynamoDB.CreateTableInput = {
  TableName: TABLENAME,
  KeySchema: [
    {AttributeName: 'access_code', KeyType: 'HASH'}, // Partition key
  ],
  AttributeDefinitions: [
    {AttributeName: 'access_code', AttributeType: 'S'},
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
};

export class AccessCodeTableItem {

  constructor(public access_token: string, 
    public refresh_token: string, 
    public access_code: string) {
  }

}

class AccessCodeDao {

  private static _instance: AccessCodeDao;
  private dynamodb;
  private docClient;// = new AWS.DynamoDB.DocumentClient(connParams);

  apiKey: string;
  
  constructor(private endpoint: string) {
    if (AccessCodeDao._instance) {
      throw new Error('Singleton already instantiated');
    }
    this.dynamodb = new AWS.DynamoDB({ endpoint: endpoint });
    this.docClient = new AWS.DynamoDB.DocumentClient({ endpoint: endpoint });
  }
  
  public static getInstance(endpoint?: string): AccessCodeDao {
    if (!AccessCodeDao._instance) {
      AccessCodeDao._instance = new AccessCodeDao(endpoint);
    }
    return AccessCodeDao._instance;
  }
  
  public tableExists():Promise<Boolean> {
    return this.dynamodb.describeTable(
      {
        TableName: TABLENAME,
      }
    ).promise()
    .then((data) => {
      return data.Table != null;
    })
    .catch((err) => {
        // TODO: parse the error?
        return false;
      });
    }
    
  async getTokens(code: string) {
   const dbTokens = await this.docClient.get({
     TableName: TABLENAME,
     Key: {
       access_code: code,
     },
   }).promise();

   return dbTokens.Item;
  }
  
  async dropTable() {
    const promise = new Promise((resolve, reject) => {
      this.dynamodb.deleteTable({
        TableName: TABLENAME,
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    return promise;
  }
  
  async createTable() {
    const promise = new Promise((resolve, reject) => {
      this.dynamodb.createTable(params, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    return promise;
  }

  /**
   * Upsert forecasts.
   * @param {WeatherForecast[]} forecasts
   * @return {Promise}
   */
  async put(item: AccessCodeTableItem): Promise<void> {
    const dbResult = await this.docClient.put({
      TableName: TABLENAME,
      Item: item,
    }).promise();

    return;
  }
}

export const accessCodeDao = AccessCodeDao.getInstance();