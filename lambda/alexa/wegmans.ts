
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
import { AccessTokenNotFoundLoggedEvent } from "../../models/logged-events/AccessTokenNotFound";
import { LoggedEvent } from "../../models/LoggedEvent";
import { AccessToken } from "../../models/AccessToken";

const APP_ID = "amzn1.ask.skill.ee768e33-44df-48f8-8fcd-1a187d502b75";
//TODO: support adding quantities: "add 5 goat cheeses"
const SPEECH_NOT_IMPLEMENTED = "Aaron says: This feature is not yet implemented.";
const STOP_MESSAGE = "Bye";

const PRODUCT_SLOT = "product";

const initTablesPromise = accessCodeDao.initTables();
const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise])
  .then(() => new WegmansDao(config.get("wegmans.apikey")));

export const splashResponse: RequestHandler = {
  canHandle(handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;
    if (request.type === 'LaunchRequest'
      || (
        request.type === 'IntentRequest'
        && (
          request.intent.name === "HelpIntent"
          || request.intent.name === 'FallbackIntent'
        )
      )
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

    return request.type === "IntentRequest"
      && request.intent.name === "AddToShoppingList";
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const startMs = new Date().valueOf();

    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const intent = request.intent;
    
    const wegmansDao = await wegmansDaoPromise;
    
    // Get skill access token from request and match it up with wegmans auth tokens from dynamo
    let accessToken;
    let tokensPromise: Promise<AccessToken>;
    if (handlerInput.requestEnvelope.session && handlerInput.requestEnvelope.session.user.accessToken) {
      accessToken = handlerInput.requestEnvelope.session.user.accessToken;
      tokensPromise = accessCodeDao.getTokensByAccess(accessToken);
    } else {
      //TODO: do both these approaches work?
      logger.info(new AccessTokenNotFoundLoggedEvent().toString());
      tokensPromise = wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));
    }
    
    // What did the user ask for?  Pull it out of the intent slot.
    const productQuery = intent.slots![PRODUCT_SLOT].value;
    
    // Given the user's tokens, look up their storeId
    const tokens = await logDuration('getTokens', tokensPromise);
    accessToken = accessToken || tokens.access;
    const storeId = WegmansDao.getStoreIdFromTokens(tokens);
    // Find a product
    const {orderedProducts, cacheUpdatePromise} = await logDuration('wegmansDao.getOrderHistory', wegmansDao.getOrderHistory(accessToken, storeId));
    const product = await ProductSearch.searchForProductPreferHistory(orderedProducts, productQuery, storeId);
    if (product) {
      logger.debug(new LoggedEvent('foundProduct')
        .addProperty('name', product.name)
        .addProperty('ms', (new Date().valueOf() - startMs)).toString());
    }
    else {
      logger.debug(new LoggedEvent('noProductFound')
        .addProperty('ms', (new Date().valueOf() - startMs)).toString());
    }

    if (cacheUpdatePromise) {
      cacheUpdatePromise.then(() => logger.info('updated cache')); // TODO: do this in the background AFTER alexa has responded
    }

    if (!product) {
      const msg = `Sorry, Wegmans doesn't sell ${productQuery}.`;
      logger.info(new LoggedEvent('response').addProperty('msg', msg).toString());
      return Promise.resolve(
        handlerInput.responseBuilder
          .speak(msg)
          .getResponse(),
      );
    }

    // Add to shopping list asynchronously; don't hold up the response.
    await wegmansDao.addProductToShoppingList(accessToken, product);
    // New shit!
    try {
      await wegmansDao.enqueue_addProductToShoppingList(accessToken, product);
    } catch(err) {
      logger.error(err);
    }

    const alexaFriendlyProductName = product.name.replace(/\&/g, 'and');

    const msg = `Added ${alexaFriendlyProductName} to your wegmans shopping list.`;
    logger.info(new LoggedEvent('response').addProperty('msg', msg).toString());
    return handlerInput.responseBuilder
      .speak(msg)
      .getResponse();
  },
};

export const testAuth: RequestHandler = {
  canHandle(handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;

    return request.type === "IntentRequest"
      && request.intent.name === "TestAuth";
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {

    return Promise.resolve(
      handlerInput.responseBuilder
        .speak(`Auth yoself please`)
        .withLinkAccountCard()
        .getResponse(),
    );
  },
};
