
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
 * Every night, we pre-refresh each user's latest tokens via Wegmans so that when Alexa sends us a 
 * refresh token during the skill request, we already have the fresh tokens ready for them
 * and don't need to hit Wegmans during the live skill request.
 */

export async function handler() {
  logger.debug("getting wegmansDao");
  const wegmansDao = await wegmansDaoPromise;
  logger.debug("getAllAccessTokens");
  const allTokens = await accessCodeDao.getAllAccessTokens();
  const tokensByUsername = _.groupBy(allTokens, getUsernameFromToken);

  for (const username of _.keys(tokensByUsername)) {
    const tokensForUser = tokensByUsername[username] as AccessToken[];
    // Sort by issued date, newest first
    const sortedTokensForUser = _.sortBy(tokensForUser, (token: AccessToken) => 
      decodeAccess(token.access).iat.valueOf() * -1
    );

    const tokensToRefresh = getMostRecentlyIssuedToken(tokensForUser);
    
    const freshTokens = await logTime('refreshTokens', wegmansDao.refreshTokens(tokensToRefresh.refresh, tokensToRefresh.user));

    // Put the tokens in the pre-refreshed table
    await logTime('putPreRefreshedTokens', accessCodeDao.putPreRefreshedTokens({
      ...freshTokens,
      refreshed_by: tokensToRefresh.refresh
    }));
    
    // Put the tokens in the conventional access tables so they can be pulled once in circulation
    await logTime('putTokens', accessCodeDao.put(freshTokens));

    //TODO: the order-history-updater cron goes through ALL tokens and refreshes if necessary.  Is that going to mess us up?
    //TODO: make the order-history-updater cron grab only the most recently issued tokens.  Same with here.

  }
}