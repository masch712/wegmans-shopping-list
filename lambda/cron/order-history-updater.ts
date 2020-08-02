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

const initTablesPromise = accessCodeDao.initTables();
const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise]).then(
  () => new WegmansDao(config.get("wegmans.apikey"))
);

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

    const result = await wegmansDao.getOrderHistory(wedgiesToken.access, storeId, true);
    if (result.cacheUpdatePromise) {
      logger().info("updating cache for user " + userId); //TODO: parse user token into a type
      if (isLiveRun) {
        await result.cacheUpdatePromise;
      }
    }
  }
}
