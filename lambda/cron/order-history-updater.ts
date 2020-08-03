import { accessCodeDao } from "../../lib/AccessCodeDao";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib/WegmansDao";
import { config } from "../../lib/config";
import { logger } from "../../lib/Logger";
import {
  // getStoreIdFromTokens,
  isAccessTokenExpired,
  getUserIdFromToken,
  getMostRecentlyIssuedToken,
  WedgiesOAuthToken,
  unwrapWedgiesToken,
} from "../../models/AccessToken";
import * as _ from "lodash";
import { toCookieJar } from "../../models/BrowserLoginTokens";
import { DateTime } from "luxon";
import { orderHistoryDao, OrderHistoryItem } from "../../lib/OrderHistoryDao";

const initTablesPromise = accessCodeDao.initTables();
const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise]).then(() => new WegmansDao());

const isLiveRun = !!process.env["LIVE_RUN"];

export async function handler() {
  logger().debug("getting wegmansDao");
  const wegmansDao = await wegmansDaoPromise;
  logger().debug("getAllAccessTokens");
  const allTokens = await accessCodeDao.getAllAccessTokens();
  const tokensByUserId = _.groupBy(allTokens, getUserIdFromToken);
  for (const userId of _.keys(tokensByUserId)) {
    const wedgiesTokensForUser = tokensByUserId[userId] as WedgiesOAuthToken[];
    const wedgiesToken = getMostRecentlyIssuedToken(wedgiesTokensForUser);
    let wegmansToken = unwrapWedgiesToken(wedgiesToken.access, config.get("jwtSecret"));
    // Refresh if necessary.  Don't worry, Alexa will still be able to refresh the old token again.
    // That said, it's probably best to leave the expired access token in place so that alexa
    // can refresh it on her own.
    if (isAccessTokenExpired(wedgiesToken) || process.env.FORCE_REFRESH) {
      logger().info("Refreshing token");
      const newToken = await wegmansDao.refreshTokens(wegmansToken);
      wegmansToken = newToken;
    }

    const cookieJar = toCookieJar(wegmansToken);
    const fromDate = new DateTime().minus({ days: 180 });

    const [orderHistory, purchaseHistory] = await Promise.all([
      wegmansDao.getOrderSummaries(cookieJar, fromDate),
      wegmansDao.getPurchaseSummaries(cookieJar, fromDate),
    ]);

    const [orderDetailses, purchaseDetailses] = await Promise.all([
      Promise.all(orderHistory.items.map((oH) => wegmansDao.getOrderDetail(cookieJar, oH.id))),
      Promise.all(
        purchaseHistory.items.map((pH) => wegmansDao.getPurchaseDetail(cookieJar, Number.parseInt(pH.id, 10)))
      ),
    ]);

    const orderedItems: OrderHistoryItem[] = orderDetailses.flatMap((oD) =>
      oD.order_items.map((oI) => ({
        purchaseMsSinceEpoch: DateTime.fromISO(oD.fulfillment_date).valueOf(),
        quantity: oI.quantity,
        storeProduct: oI.store_product,
      }))
    );
    const purchasedItems: OrderHistoryItem[] = purchaseDetailses.flatMap((pD) =>
      pD.items.map((pI) => ({
        purchaseMsSinceEpoch: DateTime.fromISO(pD.timestamp).valueOf(),
        quantity: pI.quantity,
        storeProduct: pI.store_product,
      }))
    );

    const orderHistoryItemsSorted = [...orderedItems, ...purchasedItems].sort(
      (a, b) => a.purchaseMsSinceEpoch - b.purchaseMsSinceEpoch
    );

    await orderHistoryDao.put({
      userId,
      endDateMsSinceEpoch: new Date().valueOf(),
      orderedItems: orderHistoryItemsSorted,
    });
  }
}
