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
import { getWorkType as addToShoppingListWorkType } from "./PutToShoppingCart";
import { WedgiesOAuthToken } from "../../models/AccessToken";
import { BrowserLoginTokens } from "../../models/BrowserLoginTokens";

// Function instead of constant because the imported addToShoppingListWorkthype was evaluating as undef for some reason, probably weird import order issue.  Easy workaround is defer evaluation to runtime by making it a function!
export function getWorkType(): WorkType {
  return {
    name: "SearchThenAddToShoppingList",
    enqueuesTo: [addToShoppingListWorkType()],
  };
}

export interface SearchThenPutItemToCartWork extends QueuedWork {
  payload: {
    productQuery: string;
    quantity: number;
    wegmansTokens: BrowserLoginTokens;
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
    const message = JSON.parse(body) as SearchThenPutItemToCartWork;
    logger().debug(new LoggedEvent("parsedMessage").addProperty("message", message).toString());
    const { productQuery, wegmansTokens, quantity } = message.payload;
    // TODO: GIVE PERMISSION FOR THIS WORKER OT addToShoppingList
    // https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logEventViewer:group=/aws/lambda/dev-cdk-wegmans-worker-SearchThenAddToShoppingList;stream=2019/11/29/[$LATEST]4936f2f71e7242a39a6d31c5b25e03f8;start=2019-11-28T16:31:48Z
    await wegmansService.handleAddtoShoppingList(productQuery, wegmansTokens, 10_000_000);
  }
}
