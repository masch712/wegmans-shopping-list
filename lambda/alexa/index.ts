import { SkillBuilders, DefaultApiClient } from "ask-sdk-core";
import { addToShoppingList, testAuth, splashResponse } from "./wegmans";
const skillBuilder = SkillBuilders.custom();

/* LAMBDA SETUP */
exports.handler = skillBuilder
  .addRequestHandlers(addToShoppingList, testAuth, splashResponse)
  .withApiClient(new DefaultApiClient())
  // .addErrorHandlers(UserConfigErrorHandler)
  .lambda();
