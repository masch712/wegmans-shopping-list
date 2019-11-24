import { HandlerInput, RequestHandler } from "ask-sdk-core";
import { IntentRequest, Response } from "ask-sdk-model";
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

const APP_ID = "amzn1.ask.skill.ee768e33-44df-48f8-8fcd-1a187d502b75";
//TODO: support adding quantities: "add 5 goat cheeses"

const PRODUCT_SLOT = "product";

const initTablesPromise = accessCodeDao.initTables(); //TODO: this initTables pattern sucks ass.  shouldn't be calling this everywhere
const wegmansDaoPromise = Promise.all([
  decryptionPromise,
  initTablesPromise
]).then(() => new WegmansDao(config.get("wegmans.apikey")));

export const splashResponse: RequestHandler = {
  canHandle(handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;
    if (
      request.type === "LaunchRequest" ||
      (request.type === "IntentRequest" &&
        (request.intent.name === "HelpIntent" ||
          request.intent.name === "FallbackIntent"))
    ) {
      return true;
    }
    return false;
  },
  handle(handlerInput: HandlerInput): Promise<Response> {
    return Promise.resolve(
      handlerInput.responseBuilder
        .speak("To use the skill, ask wedgies to add something to your list.")
        .getResponse()
    );
  }
};

export const addToShoppingList: RequestHandler = {
  canHandle(handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" &&
      request.intent.name === "AddToShoppingList"
    );
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const startMs = new Date().valueOf();

    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const intent = request.intent;

    const wegmansDao = await wegmansDaoPromise;

    // Get skill access token from request and match it up with wegmans auth tokens from dynamo
    let tokensPromise: Promise<AccessToken>;
    if (
      handlerInput.requestEnvelope.session &&
      handlerInput.requestEnvelope.session.user.accessToken
    ) {
      const accessToken = handlerInput.requestEnvelope.session.user.accessToken;
      tokensPromise = accessCodeDao.getTokensByAccess(accessToken);
    } else {
      //TODO: do both these approaches work?
      logger().info(new AccessTokenNotFoundLoggedEvent().toString());
      tokensPromise = wegmansDao.login(
        config.get("wegmans.email"),
        config.get("wegmans.password")
      );
    }

    // What did the user ask for?  Pull it out of the intent slot.
    const productQuery = intent.slots![PRODUCT_SLOT].value || "";

    // Given the user's tokens, look up their storeId
    let tokens = await logDuration("getTokens", tokensPromise);
    logger().debug(JSON.stringify(getTokenInfo(tokens)));

    // HACK / TEMPORARY: If the token is expired, grab the pre-refreshed token
    // This shouldn't normally happen, because alexa should be refreshing tokens on its own by calling our auth-server lambda.
    // If it does happen, it's because our auth-server lambda returned an expired token when alexa asked it to refresh tokens (i think???)
    if (isAccessTokenExpired(tokens)) {
      logger().error(
        "Alexa gave us an expired access token: " + JSON.stringify(tokens)
      ); // If this happens, look into the access-token-refresher
      const preRefreshedTokens = await logDuration(
        "gettingPreRefreshedTokens",
        accessCodeDao.getPreRefreshedToken(tokens.refresh)
      );
      if (!preRefreshedTokens || isAccessTokenExpired(preRefreshedTokens)) {
        logger().debug(
          "preRefreshedToken was: " +
            (preRefreshedTokens &&
              JSON.stringify(decode(preRefreshedTokens.access)))
        );
        const freshTokens = await logDuration(
          "refreshingTokens",
          wegmansDao.refreshTokens(tokens.refresh, tokens.user)
        );
        await logDuration(
          "putPreRefreshedTokens",
          accessCodeDao.putPreRefreshedTokens({
            refreshed_by: tokens.refresh,
            ...freshTokens
          })
        );
        tokens = freshTokens;
      } else {
        tokens = preRefreshedTokens;
      }
    }

    // Bail if we couldn't get tokens
    if (!tokens) {
      logger().error("Couldn't get tokens!");
      return Promise.resolve(
        handlerInput.responseBuilder
          .speak(
            "Sorry, Wedgies is having trouble logging in to Wegmans.  Please try again later."
          )
          .getResponse()
      );
    }

    const storeId = getStoreIdFromTokens(tokens);
    // Find a product
    const [orderHistoryResult, pastRequestedProduct] = await Promise.all([
      logDuration(
        "wegmansDao.getOrderHistory",
        wegmansDao.getOrderHistory(tokens.access, storeId)
      ),
      logDuration(
        "productRequestHistoryDao.get",
        productRequestHistoryDao.get(getUsernameFromToken(tokens), productQuery)
      )
    ]);
    const { orderedProducts, cacheUpdatePromise } = orderHistoryResult || {};
    const product =
      (pastRequestedProduct && pastRequestedProduct.chosenProduct) ||
      (await logDuration(
        "ProductSearch.searchForProductPreferHistory",
        ProductSearch.searchForProductPreferHistory(
          orderedProducts || [],
          productQuery,
          storeId
        )
      ));
    if (product) {
      logger().debug(
        new LoggedEvent("foundProduct")
          .addProperty("name", product.name)
          .addProperty("ms", new Date().valueOf() - startMs)
          .toString()
      );
    } else {
      logger().debug(
        new LoggedEvent("noProductFound")
          .addProperty("ms", new Date().valueOf() - startMs)
          .toString()
      );
    }

    if (cacheUpdatePromise) {
      cacheUpdatePromise.then(() => logger().info("updated cache")); // TODO: do this in the background AFTER alexa has responded
    }

    if (!product) {
      const msg = `Sorry, Wegmans doesn't sell ${productQuery}.`;
      logger().info(
        new LoggedEvent("response").addProperty("msg", msg).toString()
      );
      return Promise.resolve(
        handlerInput.responseBuilder.speak(msg).getResponse()
      );
    }
    //TODO: 1) test logDuration start/end for searchPrfeerHIstory
    // 2) Promise.race between the search and setTimeout(1000) that just returns nothin
    await Promise.all([
      // Add to shopping list asynchronously; don't hold up the response.
      wegmansDao.enqueue_addProductToShoppingList(tokens.access, product),
      // Store the search result for later
      productRequestHistoryDao.put(
        getUsernameFromToken(tokens),
        productQuery,
        product
      )
    ]);

    const alexaFriendlyProductName = product.name.replace(/\&/g, "and");

    const msg = `Added ${alexaFriendlyProductName} to your wegmans shopping list.`;
    logger().info(
      new LoggedEvent("response").addProperty("msg", msg).toString()
    );
    return handlerInput.responseBuilder.speak(msg).getResponse();
  }
};

export const testAuth: RequestHandler = {
  canHandle(handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === "IntentRequest" && request.intent.name === "TestAuth"
    );
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
