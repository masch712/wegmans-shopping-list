import { SkillBuilders } from "ask-sdk-core";
import { AddToShoppingList } from "./wegmans";
const skillBuilder = SkillBuilders.custom();

/* LAMBDA SETUP */
exports.handler = skillBuilder
  .addRequestHandlers(
    AddToShoppingList,
  )
  // .addErrorHandlers(UserConfigErrorHandler)
  .lambda();
