import request = require("request");
import requestPromise = require("request-promise-native");

declare const cancellableRequest: request.RequestAPI<
  requestPromise.RequestPromise,
  requestPromise.RequestPromiseOptions,
  request.RequiredUriUrl
>;
export = cancellableRequest;
