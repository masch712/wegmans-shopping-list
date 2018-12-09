import { LoggedEvent } from "../LoggedEvent";

export class AccessTokenNotFoundLoggedEvent extends LoggedEvent {
  constructor() {
    super('AccessTokenNotFound');
  }
}