
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
      logger.info("No access token found; trying wegmans.email and wegmans.password");
      const tokens = await wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));
      accessToken = tokens.access;
    } else {
      logger.debug("Access token: " + accessToken);
    }

    const productQuery = intent.slots[PRODUCT_SLOT].value;

    const storeId = WegmansDao.getStoreIdFromTokens(await tokensPromise);
    logger.debug('storeId: ' + storeId);
    
    const product = await ProductSearch.searchForProductPreferHistory(wegmansDao.getOrderHistory(accessToken, storeId), productQuery, storeId);

    logger.debug('found product ' + product.name + ' in ' + (new Date().valueOf() - startMs) + ' ms');

    if (!product) {
      return Promise.resolve(
        handlerInput.responseBuilder
          .speak(`Sorry, Wegmans doesn't sell ${productQuery}.`)
          .getResponse(),
      );
    }

    await wegmansDao.addProductToShoppingList(accessToken, product);

    logger.debug('Returning alexa response');

    return Promise.resolve(
      handlerInput.responseBuilder
        .speak(`Added ${product.name} to your wegmans shopping list.`)
        .getResponse(),
    );
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
