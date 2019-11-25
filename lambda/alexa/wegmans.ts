import { HandlerInput, RequestHandler } from "ask-sdk-core";
import { IntentRequest, Response } from "ask-sdk-model";
import * as _ from "lodash";
import { config } from "../../lib/config";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib/WegmansDao";
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { WegmansService } from "../../lib/WegmansService";
import { handleAddtoShoppingList } from "./handleAddtoShoppingList";

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

    // What did the user ask for?  Pull it out of the intent slot.
    const productQuery = intent.slots![PRODUCT_SLOT].value || "";

    const responseMessage = await handleAddtoShoppingList(wegmansService, productQuery, session);
    return handlerInput.responseBuilder.speak(responseMessage).getResponse();
  }
};

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
