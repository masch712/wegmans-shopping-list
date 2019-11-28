import { cancelAllRequestsToken } from "./CancellableRequestUtils";
import { logger } from "./Logger";
import { LoggedEvent } from "../models/LoggedEvent";

// Stolen from request-promise-native/lib/rp.js v1.0.5

let configure = require("request-promise-core/configure/request2"),
  stealthyRequire = require("stealthy-require");

// Load Request freshly - so that users can require an unaltered request instance!
let request = stealthyRequire(
  require.cache,
  function() {
    return require("request");
  },
  function() {
    require("tough-cookie");
  },
  module
);

configure({
  request,
  PromiseImpl: Promise,
  expose: ["then", "catch", "promise"]
});

const originalInit = request.Request.prototype.init; //TODO: is tihs the right one?  or just request.init?
request.Request.prototype.init = function CancellableRequest$initInterceptor(requestOptions) {
  const originalRequestPromise = originalInit.apply(this, requestOptions);

  cancelAllRequestsToken.token.promise.then(reason => {
    logger().debug(new LoggedEvent("cancelledRequest").addProperty("url", originalRequestPromise.uri.path).toString());
    originalRequestPromise.abort();
  });

  return originalRequestPromise;
};

module.exports = request;
