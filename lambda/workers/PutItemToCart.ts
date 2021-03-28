import { accessCodeDao } from "../../lib/AccessCodeDao";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib/WegmansDao";
import { SQSEvent } from "aws-lambda";
import { logger } from "../../lib/Logger";
import { QueuedWork, WorkType } from "../../lib/BasicAsyncQueue";
import { StoreProductItem } from "../../models/StoreProductItem";
import { toCookieJar, BrowserLoginTokens } from "../../models/BrowserLoginTokens";
import { getUserIdFromWegmansToken } from "../../models/AccessToken";

export function getWorkType(): WorkType {
  return {
    name: "PutItemToCart",
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
  const wegmansDao = new WegmansDao();
  //endTEST

  const messageBodies = event.Records.map((r: { body: string }) => r.body);

  for (const body of messageBodies) {
    const message = JSON.parse(body) as PutItemToCartWork;
    const userId = getUserIdFromWegmansToken(message.payload.wegmansTokens);
    logger().debug("adding " + message.payload.product.id + " for " + userId);
    const cookieJar = toCookieJar(message.payload.wegmansTokens);
    const nextOrder = await wegmansDao.getNextOrderSummary(cookieJar);
    if (nextOrder == null) {
      logger().info("adding to cart");
      await wegmansDao.putProductToCart(cookieJar, message.payload.product, message.payload.note);
    } else {
      logger().info("adding to order " + nextOrder.id);
      await wegmansDao.addProductToOrder(
        cookieJar,
        message.payload.product,
        await wegmansDao.getOrderDetail(cookieJar, nextOrder.id),
        message.payload.note
      );
    }
  }
}
