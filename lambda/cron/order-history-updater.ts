import { accessCodeDao } from "../../lib/AccessCodeDao";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib/WegmansDao";
import { config } from "../../lib/config";
import { logger } from "../../lib/Logger";
import { getStoreIdFromTokens, isAccessTokenExpired } from "../../models/AccessToken";

const initTablesPromise = accessCodeDao.initTables();
const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise])
  .then(() => new WegmansDao(config.get("wegmans.apikey")));

const isLiveRun = !!process.env['LIVE_RUN'];

export async function handler() {
  logger.debug("getting wegmansDao");
  const wegmansDao = await wegmansDaoPromise;
  logger.debug("getAllAccessTokens");
  const allTokens = await accessCodeDao.getAllAccessTokens();

  for (const token of allTokens) {
    const storeId = getStoreIdFromTokens(token);

    // Refresh if necessary.  Don't worry, Alexa will still be able to refresh the old token again.
    if (isAccessTokenExpired(token) || process.env.FORCE_REFRESH) {
      logger.info("Refreshing token");
      const newToken = await wegmansDao.refreshTokens(token.refresh, token.user);
      token.access = newToken.access;
    }

    const result = await wegmansDao.getOrderHistory(token.access, storeId, true);
    if (result.cacheUpdatePromise) {
      logger.info('updating cache for user ' + token.user.sub); //TODO: parse user token into a type
      if (isLiveRun) {
        await result.cacheUpdatePromise;
      }
    }
  }
}