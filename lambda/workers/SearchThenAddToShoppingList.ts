import { accessCodeDao } from "../../lib/AccessCodeDao";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib/WegmansDao";
import { config } from "../../lib/config";
import { SQSEvent } from "aws-lambda";
import { logger } from "../../lib/Logger";
import { decode } from "jsonwebtoken";
import { QueuedWork, WorkType } from "../../lib/BasicAsyncQueue";
import { WegmansService } from "../../lib/WegmansService";
import { LoggedEvent } from "../../models/LoggedEvent";
import { getWorkType as addToShoppingListWorkType } from "./AddToShoppingList";
import { AccessToken } from "../../models/AccessToken";

// Function instead of constant because the imported addToShoppingListWorkthype was evaluating as undef for some reason, probably weird import order issue.  Easy workaround is defer evaluation to runtime by making it a function!
export function getWorkType(): WorkType {
  return {
    name: "SearchThenAddToShoppingList",
    enqueuesTo: [addToShoppingListWorkType()]
  };
}

export interface SearchThenAddToShoppingListWork extends QueuedWork {
  payload: {
    productQuery: string;
    quantity: number;
    accessToken: AccessToken;
    // TODO: stop putting fucking tokens in fucking queues, horrible idea
  };
}

export async function handler(event: SQSEvent) {
  const initTablesPromise = accessCodeDao.initTables();
  const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise]).then(
    () => new WegmansDao(config.get("wegmans.apikey"))
  );
  const wegmansDao = await wegmansDaoPromise;
  const wegmansService = new WegmansService(wegmansDao, accessCodeDao);
  const messageBodies = event.Records.map((r: { body: string }) => r.body);

  for (const body of messageBodies) {
    const message = JSON.parse(body) as SearchThenAddToShoppingListWork;
    logger().debug(new LoggedEvent("parsedMessage").addProperty("message", message).toString());
    const { productQuery, accessToken, quantity } = message.payload;
    // const product = await wegmansService.searchForProduct(
    //   message.payload.productQuery,
    //   await accessCodeDao.getTokensByAccess(accessToken)
    // );
    // if (!product) {
    //   logger().error(new LoggedEvent("noProductFound").addProperty("query", productQuery).toString());
    //   return;
    // }

    //TODO: is the timestamp in the shopping list note gonna be right here?  close enough?
    // TODO: GIVE PERMISSION FOR THIS WORKER OT addToShoppingList
    // https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logEventViewer:group=/aws/lambda/dev-cdk-wegmans-worker-SearchThenAddToShoppingList;stream=2019/11/29/[$LATEST]4936f2f71e7242a39a6d31c5b25e03f8;start=2019-11-28T16:31:48Z
    await wegmansService.handleAddtoShoppingList(productQuery, accessToken, 10_000_000);
  }
}
