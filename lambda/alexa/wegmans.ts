
import * as _ from 'lodash';
import { logger } from '../../lib/Logger';
import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response, IntentRequest } from 'ask-sdk-model';
import { WegmansDao } from '../../lib/WegmansDao';
import { KMS } from "aws-sdk";
import config from '../../lib/config';
import { decryptionPromise } from '../../lib/decrypt-config';

const APP_ID = 'amzn1.ask.skill.ee768e33-44df-48f8-8fcd-1a187d502b75';

const SPEECH_NOT_IMPLEMENTED: string = 'Aaron says: This feature is not yet implemented.';
const STOP_MESSAGE: string = 'Bye';

const PRODUCT_SLOT = 'product';

const wegmansDaoPromise = decryptionPromise.then(() => new WegmansDao(config.get('wegmans.apikey')));

export const AddToShoppingList: RequestHandler = {
  canHandle: function (handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;
    
    return request.type === 'IntentRequest'
    && request.intent.name === 'AddToShoppingList';
  },
  handle: async function (handlerInput: HandlerInput): Promise<Response> {

    const wegmansDao = await wegmansDaoPromise;
    //TODO: await decryption before everytihng?
    await decryptionPromise;
    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const intent = request.intent;
    
    let accessToken = handlerInput.requestEnvelope.session.user.accessToken
    
    if (!accessToken) {
      logger.info('No access token found; trying wegmans.email and wegmans.password');
      const tokens = await wegmansDao.login(config.get('wegmans.email'), config.get('wegmans.password'));
      accessToken = tokens.access;
    }
    else {
      logger.debug('Access token: ' + accessToken);
    }

    const productQuery = intent.slots[PRODUCT_SLOT].value;

    const product = await wegmansDao.searchForProduct(productQuery);

    await wegmansDao.addProductToShoppingList(accessToken, product);

    return Promise.resolve(
      handlerInput.responseBuilder
        .speak(`Added ${product.name} to your wegmans shopping list.`)
        .getResponse()
    );
  }
};


export const TestAuth: RequestHandler = {
  canHandle: function (handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;
    
    return request.type === 'IntentRequest'
    && request.intent.name === 'TestAuth';
  },
  handle: async function (handlerInput: HandlerInput): Promise<Response> {
    
    return Promise.resolve(
      handlerInput.responseBuilder
        .speak(`Auth yoself please`)
        .withLinkAccountCard()
        .getResponse()
    );
  }
};
