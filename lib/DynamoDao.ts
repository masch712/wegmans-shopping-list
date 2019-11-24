import * as AWS from "aws-sdk";
import {
  CreateTableInput,
  DescribeTableOutput
} from "aws-sdk/clients/dynamodb";
import { logger } from "../lib/Logger";
import { config } from "../lib/config";

AWS.config.update({
  region: "us-east-1"
});

export abstract class DynamoDao {
  private isInitted = false;
  protected dynamodb: AWS.DynamoDB;
  protected docClient: AWS.DynamoDB.DocumentClient;
  abstract tableParams: CreateTableInput[];

  constructor(endpoint: string) {
    const options = endpoint ? { endpoint } : undefined;
    this.dynamodb = new AWS.DynamoDB(options);
    this.docClient = new AWS.DynamoDB.DocumentClient(options);
  }

  static get tableNamePrefix() {
    return config.get("aws.dynamodb.tableNamePrefix");
  }

  // @traceMethod
  async tableExists(tableName: string, timeout = 30000): Promise<boolean> {
    let tableStatus;
    const startTime = new Date().getTime();
    let duration = 0;
    do {
      let data: DescribeTableOutput = {};
      try {
        data = await this.dynamodb
          .describeTable({
            TableName: tableName
          })
          .promise();
      } catch (err) {
        logger().warn(err);
        return false;
      }
      tableStatus = data.Table && data.Table.TableStatus;
      duration += new Date().getTime() - (startTime + duration);
    } while (
      tableStatus &&
      tableStatus !== "ACTIVE" &&
      duration < timeout &&
      (await sleep(2000))
    );
    if (tableStatus && tableStatus !== "ACTIVE") {
      throw new Error(`Table ${tableName} is ${tableStatus}`);
    }
    return true;
  }

  // @traceMethod
  async dropTables(tableNames: string[]) {
    const promises = tableNames.map(table =>
      this.dynamodb
        .deleteTable({
          TableName: table
        })
        .promise()
    );

    await Promise.all(promises);
    this.isInitted = false;
  }

  async initTables() {
    if (this.isInitted || !config.get("aws").dynamodb.initTables) {
      return Promise.resolve();
    }
    const tableParam = this.tableParams;
    const tableExists: { [key: string]: boolean } = {};
    for (let i = 0; i < tableParam.length; i++) {
      tableExists[tableParam[i].TableName] = await this.tableExists(
        tableParam[i].TableName
      );
    }
    // TODO: why do i need this?
    const self = this;
    const promises = tableParam.map(param => {
      if (!tableExists[param.TableName]) {
        return self.dynamodb
          .createTable(param)
          .promise()
          .then(() => {});
      }
      return Promise.resolve();
    });

    await Promise.all(promises);
    this.isInitted = true;

    return;
  }
}

export function sleep(time: number) {
  return new Promise(resolve => setTimeout(() => resolve(true), time));
}
