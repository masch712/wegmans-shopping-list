import { SQS } from "aws-sdk";
import { config } from "./config";
import { SQSEvent } from "aws-lambda";
import * as uuid from "uuid/v4";
import { sqsEventFactory } from "../test/TestDataFactory";

export interface WorkType {
  name: string;
  enqueuesTo: WorkType[];
}
export interface QueuedWork {
  payload: any;
}

export interface WorkToEnqueue {
  payload: any;
}

function getEndpointFromQueueName(queueName: string) {
  return `https://sqs.us-east-1.amazonaws.com/${config.get("aws.account.number")}/${config.get(
    "aws.sqs.queueNames.worker-queue-prefix"
  )}${queueName}`;
}

export class BasicAsyncQueueClient<T extends QueuedWork> {
  private sqsClient: SQS;
  constructor(private workType: WorkType) {
    this.sqsClient = new SQS();
  }

  async enqueue(work: T) {
    if (config.get("runWorkersInProcess")) {
      const worker = await import(`../lambda/workers/${this.workType.name}`);
      const mockEvent: SQSEvent = {
        Records: [
          sqsEventFactory.build({
            body: JSON.stringify(work),
          }),
        ],
      };
      await worker.handler(mockEvent);
    } else {
      await this.sqsClient
        .sendMessage({
          MessageBody: JSON.stringify(work),
          QueueUrl: getEndpointFromQueueName(this.workType.name),
        })
        .promise();
    }
  }
}
