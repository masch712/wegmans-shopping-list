import { accessCodeDao } from "../../lib/AccessCodeDao";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib";
import { config } from "../../lib/config";
import { SQSEvent } from "aws-lambda";
import { logger } from "../../lib/Logger";
import { decode } from "jsonwebtoken";
import { QueuedWork, WorkType } from "../../lib/BasicAsyncQueue";
import { WegmansService } from "../../lib/WegmansService";
import { LoggedEvent } from "../../models/LoggedEvent";

export interface SearchThenAddToShoppingListWork extends QueuedWork {
  payload: {
    productQuery: string;
    quantity: number;
    accessToken: string; //TODO: take all the tokens here in case we need a refresh?
  };
  workType: WorkType.SearchThenAddToShoppingList;
}

const initTablesPromise = accessCodeDao.initTables();
const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise]).then(
  () => new WegmansDao(config.get("wegmans.apikey"))
);

export async function handler(event: SQSEvent) {
  const wegmansDao = await wegmansDaoPromise;
  const wegmansService = new WegmansService(wegmansDao, accessCodeDao);
  const messageBodies = event.Records.map((r: { body: string }) => r.body);

  for (const body of messageBodies) {
    const message = JSON.parse(body) as SearchThenAddToShoppingListWork;
    const username = decode(message.payload.accessToken)!.sub;
    const { productQuery, accessToken, quantity } = message.payload;
    const product = await wegmansService.searchForProduct(
      message.payload.productQuery,
      await accessCodeDao.getTokensByAccess(accessToken)
    );
    if (!product) {
      logger().error(new LoggedEvent("noProductFound").addProperty("query", productQuery).toString());
      return;
    }
    logger().debug("adding " + product.sku + " for " + username);
    await wegmansDao.addProductToShoppingList(accessToken, product, quantity);
  }
}
