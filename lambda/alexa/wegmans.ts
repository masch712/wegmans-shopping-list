import { HandlerInput, RequestHandler } from "ask-sdk-core";
import { IntentRequest, Response } from "ask-sdk-model";
import * as _ from "lodash";
import { config } from "../../lib/config";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib/WegmansDao";
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { WegmansService } from "../../lib/WegmansService";
import { cancelAllRequests } from "../../lib/CancelAllRequestsUtils";

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
    /**
     * Try to keep this wraper razor-thin because it's hard to write tests for it.
     */
    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const intent = request.intent;
    const accessToken = _.get(handlerInput, "requestEnvelope.session.user.accessToken");

    const wegmansDao = await wegmansDaoPromise;
    const wegmansService = new WegmansService(wegmansDao, accessCodeDao);

    // What did the user ask for?  Pull it out of the intent slot.
    const productQuery = intent.slots![PRODUCT_SLOT].value || "";

    const responseMessage = await wegmansService.handleAddtoShoppingList(
      productQuery,
      accessToken,
      config.get("alexa.skill.productSearchShortCircuitMillis")
    );

    // Sorry about the global side effects of cancelAllRequests() but we gotta do cleanup somewhere.
    // If you have an HTTP request you don't want cancelled, you should either:
    //  A) import request-promise-native, not CancellableRequest
    //  B) Put that request promise on the critical path so that it's resolve by this point
    cancelAllRequests();

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
