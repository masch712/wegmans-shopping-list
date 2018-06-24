import { SkillBuilders } from "ask-sdk-core";
import { addToShoppingList, testAuth } from "./wegmans";
const skillBuilder = SkillBuilders.custom();

/* LAMBDA SETUP */
exports.handler = skillBuilder
  .addRequestHandlers(
    addToShoppingList,
    testAuth,
  )
  // .addErrorHandlers(UserConfigErrorHandler)
  .lambda();
