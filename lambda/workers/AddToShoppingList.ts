import { SQS } from "aws-sdk";
import { Product } from "../../models/Product";
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib";
import { config } from "../../lib/config";
import { SQSEvent } from "aws-lambda";
import { logger } from "../../lib/Logger";
import { decode } from "jsonwebtoken";
import { QueuedWork, WorkType } from "../../lib/BasicAsyncQueue";

export interface AddToShoppingListWork extends QueuedWork {
  payload: {
    product: Product;
    quantity: number;
    accessToken: string; //TODO: take all the tokens here in case we need a refresh?
    note: string;
  };
  workType: WorkType.AddToShoppingList;
}

const initTablesPromise = accessCodeDao.initTables();
const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise]).then(
  () => new WegmansDao(config.get("wegmans.apikey"))
);

export async function handler(event: SQSEvent) {
  const wegmansDao = await wegmansDaoPromise;

  const messageBodies = event.Records.map((r: { body: string }) => r.body);

  for (const body of messageBodies) {
    const message = JSON.parse(body) as AddToShoppingListWork;
    const username = decode(message.payload.accessToken)!.sub;
    logger().debug("adding " + message.payload.product.sku + " for " + username);
    await wegmansDao.addProductToShoppingList(
      message.payload.accessToken,
      message.payload.product,
      message.payload.quantity,
      message.payload.note
    );
  }
}
