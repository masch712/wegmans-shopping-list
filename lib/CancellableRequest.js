import { cancelAllRequestsToken } from "./CancellableRequestUtils";
import { logger } from "./Logger";
import { LoggedEvent } from "../models/LoggedEvent";
import * as request from "request-promise-native";

const originalInit = request.Request.prototype.init; //TODO: is tihs the right one?  or just request.init?
request.Request.prototype.init = function CancellableRequest$initInterceptor(requestOptions) {
  const originalRequestPromise = originalInit.call(this, requestOptions);

  cancelAllRequestsToken.token.promise.then(reason => {
    logger().debug(new LoggedEvent("cancelledRequest").addProperty("url", originalRequestPromise.uri.path).toString());
    originalRequestPromise.abort();
  });

  return originalRequestPromise;
};

module.exports = request;
