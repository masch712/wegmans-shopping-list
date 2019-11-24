import { HandlerInput, RequestHandler, ResponseBuilder } from "ask-sdk-core";
import { IntentRequest, Response, Intent, Session } from "ask-sdk-model";
import { KMS } from "aws-sdk";
import * as _ from "lodash";
import { config } from "../../lib/config";
import { decryptionPromise } from "../../lib/decrypt-config";
import { logger, logDuration } from "../../lib/Logger";
import { WegmansDao } from "../../lib/WegmansDao";
import { ProductSearch } from "../../lib/ProductSearch";
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { productRequestHistoryDao } from "../../lib/ProductRequestHistoryDao";
import { AccessTokenNotFoundLoggedEvent } from "../../models/logged-events/AccessTokenNotFound";
import { LoggedEvent } from "../../models/LoggedEvent";
import {
  AccessToken,
  getStoreIdFromTokens,
  isAccessTokenExpired,
  getUsernameFromToken,
  getTokenInfo
} from "../../models/AccessToken";
import { decode } from "jsonwebtoken";
import { WegmansService } from "../../lib/WegmansService";

const APP_ID = "amzn1.ask.skill.ee768e33-44df-48f8-8fcd-1a187d502b75";
//TODO: support adding quantities: "add 5 goat cheeses"

const PRODUCT_SLOT = "product";

const initTablesPromise = accessCodeDao.initTables(); //TODO: this initTables pattern sucks ass.  shouldn't be calling this everywhere
const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise]).then(
  () => new WegmansDao(config.get("wegmans.apikey"))
);

export const splashResponse: RequestHandler = {
  canHandle(handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;
    if (
      request.type === "LaunchRequest" ||
      (request.type === "IntentRequest" &&
        (request.intent.name === "HelpIntent" || request.intent.name === "FallbackIntent"))
    ) {
      return true;
    }
    return false;
  },
  handle(handlerInput: HandlerInput): Promise<Response> {
    return Promise.resolve(
      handlerInput.responseBuilder.speak("To use the skill, ask wedgies to add something to your list.").getResponse()
    );
  }
};

export const addToShoppingList: RequestHandler = {
  canHandle(handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;

    return request.type === "IntentRequest" && request.intent.name === "AddToShoppingList";
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const intent = request.intent;
    const session = handlerInput.requestEnvelope.session;

    const wegmansDao = await wegmansDaoPromise;
    const wegmansService = new WegmansService(wegmansDao, accessCodeDao);

    return handleAddtoShoppingList(wegmansService, intent, session, handlerInput.responseBuilder);
  }
};

export async function handleAddtoShoppingList(
  wegmansService: WegmansService,
  intent: Intent,
  session: Session | undefined,
  responseBuilder: ResponseBuilder
) {
  const startMs = new Date().valueOf();

  // What did the user ask for?  Pull it out of the intent slot.
  const productQuery = intent.slots![PRODUCT_SLOT].value || "";

  const tokens = await logDuration("getTokens", wegmansService.getTokensFromAccess(_.get(session, "user.accessToken")));

  // Bail if we couldn't get tokens
  if (!tokens) {
    logger().error("Couldn't get tokens!");
    return Promise.resolve(
      responseBuilder
        .speak("Sorry, Wedgies is having trouble logging in to Wegmans.  Please try again later.")
        .getResponse()
    );
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
    return Promise.resolve(responseBuilder.speak(msg).getResponse());
  }

  //TODO: 1) test logDuration start/end for searchPrfeerHIstory
  // 2) Promise.race between the search and setTimeout(1000) that just returns nothin

  // Add to shopping list asynchronously; don't hold up the response.
  await wegmansService.wegmansDao.enqueue_addProductToShoppingList(tokens.access, product);

  const alexaFriendlyProductName = product.name.replace(/\&/g, "and");

  const msg = `Added ${alexaFriendlyProductName} to your wegmans shopping list.`;
  logger().info(new LoggedEvent("response").addProperty("msg", msg).toString());
  return responseBuilder.speak(msg).getResponse();
}

export const testAuth: RequestHandler = {
  canHandle(handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;

    return request.type === "IntentRequest" && request.intent.name === "TestAuth";
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    return Promise.resolve(
      handlerInput.responseBuilder
        .speak(`Auth yoself please`)
        .withLinkAccountCard()
        .getResponse()
    );
  }
};
