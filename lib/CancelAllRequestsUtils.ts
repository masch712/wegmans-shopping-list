import { logger } from "./Logger";
import { LoggedEvent } from "../models/LoggedEvent";
import { cancelAllRequestsToken as cancelHttpRequestsToken, resetCanceler } from "./CancellableRequestUtils";
import { orderHistoryDao } from "./OrderHistoryDao";

export function cancelAllRequests() {
  logger().debug(new LoggedEvent("cancelAllRequests").toString());
  const cancelReason = "globally cancelled";

  cancelHttpRequestsToken.cancel(cancelReason);
  orderHistoryDao.cancelRequests(cancelReason);
}

export function resetGlobalCanceler() {
  resetCanceler(cancelHttpRequestsToken);
  orderHistoryDao.reset();
}
