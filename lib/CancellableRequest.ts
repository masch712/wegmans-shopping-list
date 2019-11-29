import { cancelAllRequestsToken } from "./CancellableRequestUtils";
import { logger } from "./Logger";
import { LoggedEvent } from "../models/LoggedEvent";
import { RequestAPI, RequiredUriUrl } from "request";
import { RequestPromise, RequestPromiseOptions } from "request-promise-native";

const stealthyRequire = require("stealthy-require");

// Load Request freshly - so that users can require an unaltered request instance!
const requestPromiseNative = stealthyRequire(require.cache, function() {
  return require("request-promise-native");
}) as RequestAPI<RequestPromise, RequestPromiseOptions, RequiredUriUrl>;

const originalInit = ((requestPromiseNative as unknown) as any).Request.prototype.init; //TODO: is tihs the right one?  or just request.init?
((requestPromiseNative as unknown) as any).Request.prototype.init = function CancellableRequest$initInterceptor(
  requestOptions: any
) {
  originalInit.call(this, requestOptions);

  cancelAllRequestsToken.token.promise.then(reason => {
    logger().debug(new LoggedEvent("cancelledRequest").addProperty("url", this.uri.path).toString());
    this.abort();
    this._rp_reject(new RequestAbortedError());
  });

  return this;
};

class RequestAbortedError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export = requestPromiseNative;
