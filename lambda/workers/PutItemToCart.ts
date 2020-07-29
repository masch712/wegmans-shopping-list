import { SQS } from "aws-sdk";
import { Product } from "../../models/Product";
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib/WegmansDao";
import { config } from "../../lib/config";
import { SQSEvent } from "aws-lambda";
import { logger } from "../../lib/Logger";
import { QueuedWork, WorkType } from "../../lib/BasicAsyncQueue";
import { StoreProductItem } from "../../models/StoreProductItem";
import { toCookieJar, BrowserLoginTokens } from "../../models/BrowserLoginTokens";
import { getUserIdFromWegmansToken } from "../../models/AccessToken";

export function getWorkType(): WorkType {
  return {
    name: "PutItemToCart", //TODO: dynamically get worktype from filename?
    enqueuesTo: [],
  };
}
export interface PutItemToCartWork extends QueuedWork {
  payload: {
    product: StoreProductItem;
    quantity: number;
    wegmansTokens: BrowserLoginTokens; //TODO: take all the tokens here in case we need a refresh?
    note: string;
  };
}

export async function handler(event: SQSEvent) {
  logger().debug(JSON.stringify({ event }));
  const initTablesPromise = accessCodeDao.initTables();
  // TEST
  await decryptionPromise;
  await initTablesPromise;
  const wegmansDao = new WegmansDao(config.get("wegmans.apikey"));
  //endTEST
  // const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise]).then(
  //   () => new WegmansDao(config.get("wegmans.apikey"))
  // );
  // const wegmansDao = await wegmansDaoPromise;

  const messageBodies = event.Records.map((r: { body: string }) => r.body);

  for (const body of messageBodies) {
    const message = JSON.parse(body) as PutItemToCartWork;
    const userId = getUserIdFromWegmansToken(message.payload.wegmansTokens);
    logger().debug("adding " + message.payload.product.id + " for " + userId);
    //TODO: add the note as well
    await wegmansDao.putProductToCart(toCookieJar(message.payload.wegmansTokens), message.payload.product);
  }
}
