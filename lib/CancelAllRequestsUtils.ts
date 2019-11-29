import { logger } from "./Logger";
import { LoggedEvent } from "../models/LoggedEvent";
import { cancelAllRequestsToken as cancelHttpRequestsToken } from "./CancellableRequestUtils";
import { productRequestHistoryDao } from "./ProductRequestHistoryDao";
import { orderHistoryDao } from "./OrderHistoryDao";

export function cancelAllRequests() {
  logger().debug(new LoggedEvent("cancelAllRequests").toString());
  const cancelReason = "globally cancelled";

  cancelHttpRequestsToken.cancel(cancelReason);
  productRequestHistoryDao.cancelRequests(cancelReason);
  orderHistoryDao.cancelRequests(cancelReason);
}
