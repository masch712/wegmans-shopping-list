import { SkillBuilders, DefaultApiClient, HandlerInput } from "ask-sdk-core";
import { addToShoppingList, testAuth, splashResponse } from "./wegmans";
import { resetGlobalCanceler } from "../../lib/CancelAllRequestsUtils";
const skillBuilder = SkillBuilders.custom();

/* LAMBDA SETUP */
exports.handler = skillBuilder
  .withApiClient(new DefaultApiClient())
  .addRequestInterceptors((input: HandlerInput) => {
    resetGlobalCanceler();
  })
  .addRequestHandlers(addToShoppingList, testAuth, splashResponse)
  // .addErrorHandlers(UserConfigErrorHandler)
  .lambda();
