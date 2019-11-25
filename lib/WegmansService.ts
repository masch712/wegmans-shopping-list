import { logDuration, logger } from "./Logger";

import { productRequestHistoryDao } from "./ProductRequestHistoryDao";

import { getUsernameFromToken, AccessToken, getStoreIdFromTokens, isAccessTokenExpired } from "../models/AccessToken";

import { WegmansDao } from "./WegmansDao";
import { ProductSearch } from "./ProductSearch";
import { AccessCodeDao } from "./AccessCodeDao";
import { AccessTokenNotFoundLoggedEvent } from "../models/logged-events/AccessTokenNotFound";
import { config } from "./config";
import { decode } from "jsonwebtoken";
import { LoggedEvent } from "../models/LoggedEvent";
import { Product } from "../models/Product";

export class WegmansService {
  constructor(private _wegmansDao: WegmansDao, private _accessCodeDao: AccessCodeDao) {}
  get wegmansDao() {
    return this._wegmansDao;
  }
  async searchForProduct(productQuery: string, tokens: AccessToken) {
    const storeId = getStoreIdFromTokens(tokens);
    // Find a product
    const [orderHistoryResult, pastRequestedProduct] = await Promise.all([
      logDuration("wegmansDao.getOrderHistory", this._wegmansDao.getOrderHistory(tokens.access, storeId)),
      logDuration(
        "productRequestHistoryDao.get",
        productRequestHistoryDao.get(getUsernameFromToken(tokens), productQuery)
      )
    ]);
    const { orderedProducts, cacheUpdatePromise } = orderHistoryResult || {};
    const product =
      (pastRequestedProduct && pastRequestedProduct.chosenProduct) ||
      (await logDuration(
        "ProductSearch.searchForProductPreferHistory",
        ProductSearch.searchForProductPreferHistory(orderedProducts || [], productQuery, storeId)
      ));

    if (cacheUpdatePromise) {
      cacheUpdatePromise.then(() => logger().info("updated cache")); // TODO: do this in the background AFTER alexa has responded
    }

    // Store the search result for later
    product && productRequestHistoryDao.put(getUsernameFromToken(tokens), productQuery, product);
    return product;
  }

  async getTokensFromAccess(accessToken?: string) {
    // Get skill access token from request and match it up with wegmans auth tokens from dynamo
    logger().debug(
      new LoggedEvent("WegmansService.getTokensFromAccess").addProperty("accessToken", accessToken).toString()
    );
    let tokensPromise: Promise<AccessToken>;
    if (accessToken) {
      tokensPromise = this._accessCodeDao.getTokensByAccess(accessToken);
    } else {
      //TODO: do both these approaches work?
      logger().info(new AccessTokenNotFoundLoggedEvent().toString());
      tokensPromise = this._wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));
    }

    let tokens = await tokensPromise;

    // HACK / TEMPORARY: If the token is expired, grab the pre-refreshed token
    // This shouldn't normally happen, because alexa should be refreshing tokens on its own by calling our auth-server lambda.
    // If it does happen, it's because our auth-server lambda returned an expired token when alexa asked it to refresh tokens (i think???)
    const isExpired = isAccessTokenExpired(tokens);
    if (isExpired) {
      logger().error("Alexa gave us an expired access token: " + JSON.stringify(tokens)); // If this happens, look into the access-token-refresher
      const preRefreshedTokens = await logDuration(
        "gettingPreRefreshedTokens",
        this._accessCodeDao.getPreRefreshedToken(tokens.refresh)
      );
      if (!preRefreshedTokens || isAccessTokenExpired(preRefreshedTokens)) {
        logger().debug(
          "preRefreshedToken was: " + (preRefreshedTokens && JSON.stringify(decode(preRefreshedTokens.access)))
        );
        const freshTokens = await logDuration(
          "refreshingTokens",
          this._wegmansDao.refreshTokens(tokens.refresh, tokens.user)
        );
        await logDuration(
          "putPreRefreshedTokens",
          this._accessCodeDao.putPreRefreshedTokens({
            refreshed_by: tokens.refresh,
            ...freshTokens
          })
        );
        tokens = freshTokens;
      } else {
        tokens = preRefreshedTokens;
      }
    }
    return tokens;
  }

  async enqueue_addProductToShoppingList(accessToken: string, product: Product, quantity?: number) {
    return this.wegmansDao.enqueue_addProductToShoppingList(accessToken, product, quantity);
  }
}
