import { accessCodeDao } from "../../lib/AccessCodeDao";
import { decryptionPromise } from "../../lib/decrypt-config";
import { WegmansDao } from "../../lib/WegmansDao";
import { config } from "../../lib/config";
import { logger, logDuration as logTime } from "../../lib/Logger";
import {
  isAccessTokenExpired,
  getUserIdFromToken,
  decodeAccess,
  WedgiesOAuthToken,
  getMostRecentlyIssuedToken,
  unwrapWedgiesToken,
  wrapWegmansTokens,
} from "../../models/AccessToken";
import * as _ from "lodash";

const initTablesPromise = accessCodeDao.initTables();
const wegmansDaoPromise = Promise.all([decryptionPromise, initTablesPromise]).then(
  () => new WegmansDao(config.get("wegmans.apikey"))
);

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
  logger().debug("getting wegmansDao");
  const wegmansDao = await wegmansDaoPromise;
  logger().debug("getAllAccessTokens");
  const allTokens = await accessCodeDao.getAllAccessTokens();
  const tokensByUsername = _.groupBy(allTokens, getUserIdFromToken);

  for (const username of _.keys(tokensByUsername)) {
    const tokensForUser = tokensByUsername[username] as WedgiesOAuthToken[];

    // For each set of tokens in the primary table, pre-refresh them into the pre-refreshed table
    // NOTE: we don't need to refresh the pre-refreshed tokens; auth-server is responsible for persisting
    // pre-refreshed tokens to the primary tables when the tokens go into circulation.
    for (const tokens of tokensForUser) {
      try {
        const jwtSecret = config.get("jwtSecret");
        const wedgiesTokens = unwrapWedgiesToken(tokens.access, jwtSecret);
        const freshWegmansTokens = await wegmansDao.refreshTokens(wedgiesTokens);
        const freshWedgiesTokens = wrapWegmansTokens(freshWegmansTokens, jwtSecret);

        // Put the fresh tokens in the pre-refreshed table
        await logTime(
          "putPreRefreshedTokens",
          accessCodeDao.putPreRefreshedTokens({
            ...freshWedgiesTokens,
            refreshed_by: tokens.refresh,
          })
        );
      } catch (err) {
        logger().error("failed to refresh tokens for " + username + ": " + err);
      }
    }
  }
}
