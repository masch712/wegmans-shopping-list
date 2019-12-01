import { SQS } from "aws-sdk";
import { config } from "./config";

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
    await this.sqsClient
      .sendMessage({
        MessageBody: JSON.stringify(work),
        QueueUrl: getEndpointFromQueueName(this.workType.name)
      })
      .promise();
  }
}
