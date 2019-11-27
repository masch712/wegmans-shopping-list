import * as originalRequest from "request-promise-native";
import { UriOptions, UrlOptions, RequestCallback } from "request";
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

const _cancelAllRequestsToken = createToken();

export async function cancellableRequest(
  ...args: [
    (UriOptions & originalRequest.RequestPromiseOptions) | (UrlOptions & originalRequest.RequestPromiseOptions),
    (RequestCallback | undefined)?
  ]
) {
  //TODO: sad type coupling here.  Can't i just passthrough ...args?
  const originalRequestPromise = originalRequest(...args);

  _cancelAllRequestsToken.token.promise.then(reason => {
    logger().debug(new LoggedEvent("cancelledRequest").addProperty("url", originalRequestPromise.uri.path).toString());
    originalRequestPromise.abort();
  });

  return originalRequestPromise;
}

export function cancelAllRequests() {
  logger().debug(new LoggedEvent("cancelAllRequests").toString());
  _cancelAllRequestsToken.cancel("globally cancelled");
}
