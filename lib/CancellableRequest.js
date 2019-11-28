import { cancelAllRequestsToken } from "./CancellableRequestUtils";
import { logger } from "./Logger";
import { LoggedEvent } from "../models/LoggedEvent";

const stealthyRequire = require("stealthy-require");

// Load Request freshly - so that users can require an unaltered request instance!
const request = stealthyRequire(require.cache, function() {
  return require("request-promise-native");
});

const originalInit = request.Request.prototype.init; //TODO: is tihs the right one?  or just request.init?
request.Request.prototype.init = function CancellableRequest$initInterceptor(requestOptions) {
  originalInit.call(this, requestOptions);

  cancelAllRequestsToken.token.promise.then(reason => {
    logger().debug(new LoggedEvent("cancelledRequest").addProperty("url", this.uri.path).toString());
    this.abort();
  });

  return this;
};

module.exports = request;
