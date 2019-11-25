import { ResponseBuilder } from "ask-sdk-core";
import { Session } from "ask-sdk-model";
import { logger, logDuration } from "../../lib/Logger";
import { LoggedEvent } from "../../models/LoggedEvent";
import { getTokenInfo } from "../../models/AccessToken";
import { WegmansService } from "../../lib/WegmansService";
import * as _ from "lodash";

export async function handleAddtoShoppingList(
  wegmansService: WegmansService,
  productQuery: string,
  session: Session | undefined
) {
  const startMs = new Date().valueOf();
  const tokens = await logDuration("getTokens", wegmansService.getTokensFromAccess(_.get(session, "user.accessToken")));
  // Bail if we couldn't get tokens
  if (!tokens) {
    logger().error("Couldn't get tokens!");
    return "Sorry, Wedgies is having trouble logging in to Wegmans.  Please try again later.";
  }
  logger().debug(JSON.stringify(getTokenInfo(tokens)));
  const product = await wegmansService.searchForProduct(productQuery, tokens);
  if (product) {
    logger().debug(
      new LoggedEvent("foundProduct")
        .addProperty("name", product.name)
        .addProperty("ms", new Date().valueOf() - startMs)
        .toString()
    );
  } else {
    logger().debug(new LoggedEvent("noProductFound").addProperty("ms", new Date().valueOf() - startMs).toString());
    const msg = `Sorry, Wegmans doesn't sell ${productQuery}.`;
    logger().info(new LoggedEvent("response").addProperty("msg", msg).toString());
    return msg;
  }
  //TODO: 1) test logDuration start/end for searchPrfeerHIstory
  // 2) Promise.race between the search and setTimeout(1000) that just returns nothin

  //   // Add to shopping list asynchronously; don't hold up the response.
  const enqueueResult = await wegmansService.enqueue_addProductToShoppingList(tokens.access, product);
  const alexaFriendlyProductName = product.name.replace(/\&/g, "and");
  const msg = `Added ${alexaFriendlyProductName} to your wegmans shopping list.`;
  logger().info(new LoggedEvent("response").addProperty("msg", msg).toString());

  return msg;
  //   return Promise.resolve(responseBuilder.speak(msg).getResponse());
}
