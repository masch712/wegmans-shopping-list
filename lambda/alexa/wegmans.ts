
import { HandlerInput, RequestHandler } from "ask-sdk-core";
import { IntentRequest, Response } from "ask-sdk-model";
import { KMS } from "aws-sdk";
import * as _ from "lodash";
import { config } from "../../lib/config";
import { decryptionPromise } from "../../lib/decrypt-config";
import { logger } from "../../lib/Logger";
import { WegmansDao } from "../../lib/WegmansDao";
import { ProductSearch } from "../../lib/ProductSearch";
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { AccessTokenNotFoundLoggedEvent } from "../../models/logged-events/AccessTokenNotFound";
import { LoggedEvent } from "../../models/LoggedEvent";

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

    let accessToken = handlerInput.requestEnvelope.session.user.accessToken;
    const tokensPromise = accessCodeDao.getTokensByAccess(accessToken);

    const wegmansDao = await wegmansDaoPromise;

    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const intent = request.intent;


    if (!accessToken) {
      logger.info(new AccessTokenNotFoundLoggedEvent().toString());
      const tokens = await wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));
      accessToken = tokens.access;
    } 

    const productQuery = intent.slots[PRODUCT_SLOT].value;

    const storeId = WegmansDao.getStoreIdFromTokens(await tokensPromise);
    
    const product = await ProductSearch.searchForProductPreferHistory(wegmansDao.getOrderHistory(accessToken, storeId), productQuery, storeId);
    logger.debug(new LoggedEvent('foundProduct').addProperty('name', product.name).addProperty('ms',  (new Date().valueOf() - startMs)).toString());

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
    const addToShoppingListPromise = wegmansDao.addProductToShoppingList(accessToken, product);

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
