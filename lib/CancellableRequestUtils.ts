import { logger } from "./Logger";
import { LoggedEvent } from "../models/LoggedEvent";

// from https://medium.com/@benlesh/promise-cancellation-is-dead-long-live-promise-cancellation-c6601f1f5082
interface CancelToken {
  promise: Promise<string>;
  reason?: string;
}

function createToken() {
  let cancel: (reason: string) => void = () => {};
  const token: CancelToken = {
    promise: new Promise(resolve => {
      cancel = reason => {
        // the reason property can be checked
        // synchronously to see if you're cancelled
        token.reason = reason;
        resolve(reason);
      };
    })
  };

  return { token, cancel };
}

export const cancelAllRequestsToken = createToken();

export function cancelAllRequests() {
  logger().debug(new LoggedEvent("cancelAllRequests").toString());
  cancelAllRequestsToken.cancel("globally cancelled");
}
