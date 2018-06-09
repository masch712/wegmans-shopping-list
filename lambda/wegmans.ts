import * as _ from 'lodash';
import { logger } from '../lib/Logger';
import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response, IntentRequest } from 'ask-sdk-model';
import { WegmansDao } from '../lib/WegmansDao';
import config from '../lib/config';

const APP_ID = 'amzn1.ask.skill.ee768e33-44df-48f8-8fcd-1a187d502b75';

const SPEECH_NOT_IMPLEMENTED: string = 'Aaron says: This feature is not yet implemented.';
const STOP_MESSAGE: string = 'Bye';

const PRODUCT_SLOT = 'product';

const wegmansDao = new WegmansDao();

export const AddToShoppingList: RequestHandler = {
  canHandle: function (handlerInput: HandlerInput): Promise<boolean> | boolean {
    const request = handlerInput.requestEnvelope.request;
    
    return request.type === 'IntentRequest'
    && request.intent.name === 'AddToShoppingList';
  },
  handle: async function (handlerInput: HandlerInput): Promise<Response> {
    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const intent = request.intent;
    if (!wegmansDao.getAuthToken()) {
      await wegmansDao.login(config.get('wegmans.email'), config.get('wegmans.password'));
    }

    const productQuery = intent.slots[PRODUCT_SLOT].value;

    const product = await wegmansDao.searchForProduct(productQuery);

    return Promise.resolve(
      handlerInput.responseBuilder
        .speak(`Added ${product.name} to your wegmans shopping list.`)
        .getResponse()
    );
  }
};
