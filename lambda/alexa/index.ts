import { SkillBuilders } from "ask-sdk-core";
import { AddToShoppingList, TestAuth } from "./wegmans";
const skillBuilder = SkillBuilders.custom();

/* LAMBDA SETUP */
exports.handler = skillBuilder
  .addRequestHandlers(
    AddToShoppingList,
    TestAuth
  )
  // .addErrorHandlers(UserConfigErrorHandler)
  .lambda();
