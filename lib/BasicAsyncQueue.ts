import { SQS } from "aws-sdk";

export enum WorkType {
  AddToShoppingList = 'AddToShoppingList'
}

export interface QueuedWork {
  workType: WorkType;
  payload: any;
}

export interface WorkToEnqueue {
  payload: any;
}

function getEndpointFromQueueName(queueName: string) {
  return `https://sqs.us-east-1.amazonaws.com/412272193202/wegmans-worker-${queueName}`;
}

export class BasicAsyncQueueClient<T extends QueuedWork> {
  private sqsClient: SQS;
  constructor() {
    this.sqsClient = new SQS();
  }

  async enqueue(work: T) {

    await this.sqsClient.sendMessage({
      MessageBody: JSON.stringify(work),
      QueueUrl: getEndpointFromQueueName(work.workType.toString()),
    }).promise();
  }

}