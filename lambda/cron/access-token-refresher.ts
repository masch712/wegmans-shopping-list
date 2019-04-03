
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib/WegmansDao";
import { config } from "../../lib/config";
import { logger, logDuration as logTime } from "../../lib/Logger";
import { getStoreIdFromTokens, isAccessTokenExpired, getUsernameFromToken, decodeAccess, AccessToken, getMostRecentlyIssuedToken } from "../../models/AccessToken";
import * as _ from 'lodash';

const initTablesPromise = accessCodeDao.initTables();
const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise])
  .then(() => new WegmansDao(config.get("wegmans.apikey")));

/**
 * Every night, we pre-refresh each user's tokens via Wegmans so that when Alexa sends us a 
 * refresh token during the skill request, we already have the fresh tokens ready for them
 * and don't need to hit Wegmans during the live skill request.
 * NOTE: We have to refresh every refresh-token in the PreRefresh table every day, 
 * because they expire daily, so if someone doesn't use the alexa skill one day, then when
 * they do finally use the skill, the pre-refreshed token will be expired.  Hence, refresh 
 * all of em.
 */

export async function handler() {
  logger.debug("getting wegmansDao");
  const wegmansDao = await wegmansDaoPromise;
  logger.debug("getAllAccessTokens");
  const allTokens = await accessCodeDao.getAllAccessTokens();
  const tokensByUsername = _.groupBy(allTokens, getUsernameFromToken);

  for (const username of _.keys(tokensByUsername)) {
    // If there's already a pre-refreshed token, re-refresh it
    const tokensForUser = tokensByUsername[username] as AccessToken[];
    let tokensToRefresh: AccessToken;
    const mostRecentlyIssuedToken = getMostRecentlyIssuedToken(tokensForUser);
    const preRefreshedToken = await accessCodeDao.getPreRefreshedToken(mostRecentlyIssuedToken.refresh);
    if (preRefreshedToken) {
      logger.debug(`${username}: refreshing pre-refreshed token`);
      tokensToRefresh = preRefreshedToken;
    }
    else {
      logger.debug(`${username}: refreshing most recently issued token`);
      tokensToRefresh = mostRecentlyIssuedToken;
    }
    
    const freshTokens = await logTime('refreshTokens', wegmansDao.refreshTokens(tokensToRefresh.refresh, tokensToRefresh.user));

    // Put the tokens in the pre-refreshed table
    await logTime('putPreRefreshedTokens', accessCodeDao.putPreRefreshedTokens({
      ...freshTokens,
      refreshed_by: tokensToRefresh.refresh
    }));
    
    // Put the tokens in the conventional access tables so they can be pulled once in circulation
    await logTime('putTokens', accessCodeDao.put(freshTokens));

  }
}