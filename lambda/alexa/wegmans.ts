import * as _ from 'lodash';
import { logger } from '../../lib/Logger';
import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response, IntentRequest } from 'ask-sdk-model';
import { WegmansDao } from '../../lib/WegmansDao';
import { KMS } from "aws-sdk";
import config from '../../lib/config';

const APP_ID = 'amzn1.ask.skill.ee768e33-44df-48f8-8fcd-1a187d502b75';

const SPEECH_NOT_IMPLEMENTED: string = 'Aaron says: This feature is not yet implemented.';
const STOP_MESSAGE: string = 'Bye';

const PRODUCT_SLOT = 'product';


//TODO: abstract this shit out
const kms = new KMS();
let decryptionPromise = Promise.resolve();
if (config.get('encrypted')) {
  // Decrypt code should run once and variables stored outside of the function
  // handler so that these are decrypted once per container
  const encryptedKeys = ['wegmans.apikey', 'wegmans.email', 'wegmans.password'];
  const decryptionPromises = [];
  encryptedKeys.forEach(key => {
    if (config.get(key)) {
      decryptionPromises.push(decryptKMS(key));
    }
  });
  config.set('encrypted', false);
  decryptionPromise = Promise.all(decryptionPromises).then(() => {});
}
const wegmansDaoPromise = decryptionPromise.then(() => new WegmansDao(config.get('wegmans.apikey')));

async function decryptKMS(key): Promise<void> {
  return new Promise<void>((resolve, reject) => {

    const encrypted = config.get(key);
    let decrypted;
    kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
      if (err) {
        reject(err);
      }
      else {
        config.set(key, data.Plaintext.toString());
        resolve();
      }
    });
  });
}

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
    if (!wegmansDao.getAuthToken()) {
      await wegmansDao.login(config.get('wegmans.email'), config.get('wegmans.password'));
    }

    const productQuery = intent.slots[PRODUCT_SLOT].value;

    const product = await wegmansDao.searchForProduct(productQuery);

    await wegmansDao.addProductToShoppingList(product);

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
