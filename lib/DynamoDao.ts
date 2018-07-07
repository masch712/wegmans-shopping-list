import * as AWS from "aws-sdk";
import { AttributeMap, CreateTableInput, DescribeTableOutput } from "aws-sdk/clients/dynamodb";
import { logger } from "../lib/Logger";
import { config } from "./config";

AWS.config.update({
  region: "us-east-1",
});

export abstract class DynamoDao {

  private isInitted = false;
  protected dynamodb: AWS.DynamoDB;
  protected docClient: AWS.DynamoDB.DocumentClient;
  abstract tableParams: CreateTableInput[];

  constructor(private endpoint: string) {
    const options = endpoint ? { endpoint } : undefined;
    logger.debug(`DynamoDB options: ` + JSON.stringify(options));
    this.dynamodb = new AWS.DynamoDB(options);
    this.docClient = new AWS.DynamoDB.DocumentClient(options);
  }

  async tableExists(tableName, timeout = 30000): Promise<boolean> {
    let tableStatus;
    const startTime = new Date().getTime();
    let duration = 0;
    do {
      logger.debug("describing table " + tableName);
      let data: DescribeTableOutput = {};
      try {
        data = await this.dynamodb.describeTable(
          {
            TableName: tableName,
          },
        ).promise();
      } catch (err) {
        logger.warn(err);
        logger.debug(`couldn't get ${tableName}; assuming table doesn't exist`);
        return false;
      }
      tableStatus = data.Table && data.Table.TableStatus;
      logger.debug(`got table: status ${tableStatus}`);
      duration += new Date().getTime() - (startTime + duration);
    } while (tableStatus && tableStatus !== "ACTIVE" && duration < timeout && await sleep(2000));
    if (tableStatus && tableStatus !== "ACTIVE") {
      throw new Error(`Table ${tableName} is ${tableStatus}`);
    }
    return true;
  }

  async dropTables(tableNames: string[]) {
    const promises = tableNames.map((table) =>
    this.dynamodb.deleteTable({
        TableName: table,
      }).promise());

    await Promise.all(promises);
    this.isInitted = false;
  }

  async initTables() {
    if (this.isInitted) {
      return Promise.resolve();
    }
    logger.debug("initting tables");
    const tableParam = this.tableParams;
    const tableExists: { [key: string]: boolean } = {};
    for (let i = 0; i < tableParam.length; i++) {
      tableExists[tableParam[i].TableName] = await this.tableExists(tableParam[i].TableName);
    }
    // TODO: why do i need this?
    const self = this;
    const promises = tableParam.map((param) => {
      logger.debug(`initting ${param.TableName}`);
      if (!tableExists[param.TableName]) {
        logger.debug("create table " + param.TableName);
        return self.dynamodb.createTable(param).promise().then(() => {
          logger.debug(`${param.TableName} created`);
        });
      }
      return Promise.resolve();
    });

    await Promise.all(promises);
    this.isInitted = true;

    return;
  }

}

export function sleep(time) {
  return new Promise((resolve) => setTimeout(() => resolve(true), time));
}
