import { logDuration, logger } from "./Logger";

import { productRequestHistoryDao } from "./ProductRequestHistoryDao";

import {
  getUserIdFromToken,
  WedgiesOAuthToken,
  isAccessTokenExpired,
  getTokenInfo,
  wrapWegmansTokens,
  unwrapWedgiesToken,
} from "../models/AccessToken";
import { BrowserLoginTokens, toCookieJar, wegmansTokenInfo } from "../models/BrowserLoginTokens";
import { WegmansDao } from "./WegmansDao";
import { AccessCodeDao } from "./AccessCodeDao";
import { AccessTokenNotFoundLoggedEvent } from "../models/logged-events/AccessTokenNotFound";
import { config } from "./config";
import { StoreProductItem } from "../models/StoreProductItem";
import { decode } from "jsonwebtoken";
import { LoggedEvent } from "../models/LoggedEvent";
import { Product } from "../models/Product";
import { cancelAllRequests } from "./CancelAllRequestsUtils";
import { DateTime } from "luxon";
export class WegmansService {
  constructor(
    private _wegmansDao: WegmansDao,
    private _accessCodeDao: AccessCodeDao,
    private _timezonePromise?: Promise<string>
  ) {}
  get wegmansDao() {
    return this._wegmansDao;
  }

  async searchForProductWithTimeout(productQuery: string, tokens: BrowserLoginTokens, timeout: number) {
    let product;
    let didSearchTimeout = false;
    const searchStartTime = new Date().valueOf();
    const searchTimeoutError = new Error("search timed out");

    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        logger().debug(new LoggedEvent("searchShortCircuit.resolvingPromise").toString());
        reject(searchTimeoutError);
      }, Math.max(0, timeout));
    }) as Promise<void>;

    try {
      product = await Promise.race([
        // TODO: this is absolutely hideous.  async await new Promise?  wtf
        timeoutPromise,
        (async () => {
          const product = await this.searchForProduct(productQuery, tokens);
          return product;
        })(),
      ]);
    } catch (err) {
      logger().debug(new LoggedEvent("searchShortCircuit.caughtError").addProperty("error", err).toString());
      if (err === searchTimeoutError) {
        didSearchTimeout = true;
        logger().warn(
          new LoggedEvent("searchShortCircuit").addProperty("ms", new Date().valueOf() - searchStartTime).toString()
        );
      }
    }

    return { product, didSearchTimeout };
  }
  async handleAddtoShoppingList(productQuery: string, tokens: BrowserLoginTokens, shortCircuitMillis = 1500) {
    logger().debug(JSON.stringify({ shortCircuitMillis }));
    // Bail if we couldn't get tokens
    if (!tokens) {
      logger().error("Couldn't get tokens!");
      return "Sorry, Wedgies is having trouble logging in to Wegmans.  Please try again later.";
    }
    logger().debug(JSON.stringify(wegmansTokenInfo(tokens)));
    //TODO: the race should ONLY time the search bit.  Maybe just use bluebird?
    //      neeed to distinguish between search-fidining-no-product and timeout
    const searchStartTime = new Date().valueOf();
    const { product, didSearchTimeout } = await this.searchForProductWithTimeout(
      productQuery,
      tokens,
      shortCircuitMillis
    );
    let msg;
    if (didSearchTimeout) {
      // Sorry about the global side effects of cancelAllRequests() but we gotta do cleanup somewhere.
      // If you have an HTTP request you don't want cancelled, you should either:
      //  A) import request-promise-native, not CancellableRequest
      //  B) Put that request promise on the critical path so that it's resolve by this point
      cancelAllRequests();
      await this.enqueue_searchThenPutItemToCart(tokens, productQuery, 1);
      msg = `Adding ${productQuery} to your wegmans shopping list.`;
    } else if (product) {
      logger().debug(
        new LoggedEvent("foundProduct")
          .addProperty("name", product.name)
          .addProperty("ms", new Date().valueOf() - searchStartTime)
          .toString()
      );
      const timezone = await this._timezonePromise;
      await this.enqueue_putItemToCart(tokens, product, 1, this._getNoteForShoppingList(productQuery, timezone));
      const alexaFriendlyProductName = product.name.replace(/\&/g, "and");
      msg = `Added ${alexaFriendlyProductName} to your wegmans shopping list.`;
    } else {
      logger().debug(
        new LoggedEvent("noProductFound").addProperty("ms", new Date().valueOf() - searchStartTime).toString()
      );
      msg = `Sorry, Wegmans doesn't sell ${productQuery}.`;
    }
    logger().info(new LoggedEvent("response").addProperty("msg", msg).toString());
    return msg;
  }

  async searchForProduct(productQuery: string, tokens: BrowserLoginTokens): Promise<StoreProductItem | void> {
    const cookieJar = toCookieJar(tokens);
    const products = await this.wegmansDao.searchProducts(cookieJar, productQuery, 1);
    return products[0];
    // const storeId = getStoreIdFromTokens(tokens);
    // Find a product
    // // const [orderHistoryResult, pastRequestedProduct] = await Promise.all([
    // //   logDuration("wegmansDao.getOrderHistory", this._wegmansDao.getOrderHistory(tokens.access, storeId)),
    // //   logDuration(
    // //     "productRequestHistoryDao.get",
    // //     productRequestHistoryDao.get(getUsernameFromToken(tokens), productQuery)
    // //   ),
    // // ]);
    // // const { orderedProducts, cacheUpdatePromise } = orderHistoryResult || {};
    // // const product =
    // //   (pastRequestedProduct && pastRequestedProduct.chosenProduct) ||
    // //   (await logDuration(
    // //     "ProductSearch.searchForProductPreferHistory",
    // //     ProductSearch.searchForProductPreferHistory(orderedProducts || [], productQuery, storeId)
    // //   ));
    // // if (cacheUpdatePromise) {
    // //   cacheUpdatePromise.then(() => logger().info("updated cache")); // TODO: do this in the background AFTER alexa has responded
    // // }
    // // // Store the search result for later
    // // product && productRequestHistoryDao.put(getUsernameFromToken(tokens), productQuery, product);
    // return product;
  }

  async getFreshTokensOrLogin(tokens: WedgiesOAuthToken) {
    const jwtSecret = config.get("jwtSecret");
    // Get wedgies access token from request and match it up with wegmans tokens from db
    let tokensPromise: Promise<WedgiesOAuthToken>;
    if (tokens.access) {
      tokensPromise = this._accessCodeDao.getTokensByAccess(tokens.access);
    } else {
      logger().info(new AccessTokenNotFoundLoggedEvent().toString());
      tokensPromise = (async () => {
        const wegmansTokens = await this._wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));
        return wrapWegmansTokens(wegmansTokens, jwtSecret);
      })();
    }

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
        const freshWegmansTokens = await logDuration(
          "refreshingTokens",
          this._wegmansDao.refreshTokens(unwrapWedgiesToken(tokens.access, jwtSecret))
        );
        const freshWedgiesTokens = wrapWegmansTokens(freshWegmansTokens, jwtSecret);

        await logDuration(
          "putPreRefreshedTokens",
          this._accessCodeDao.putPreRefreshedTokens({
            refreshed_by: tokens.refresh,
            ...freshWedgiesTokens,
          })
        );
        tokens = freshWedgiesTokens;
      } else {
        tokens = preRefreshedTokens;
      }
    }
    return tokens;
  }

  _getNoteForShoppingList(productQuery: string, timezone = "America/New_York") {
    return `"${productQuery}" [added by wedgies on ${DateTime.utc()
      .setZone(timezone)
      .toLocaleString({ ...DateTime.DATETIME_SHORT, timeZoneName: "short" })}]`;
  }

  // TODO: typescript passthrough method? args, etc?
  async enqueue_putItemToCart(accessToken: BrowserLoginTokens, product: StoreProductItem, quantity = 1, note: string) {
    return this.wegmansDao.enqueue_putItemToCart(accessToken, product, quantity, note);
  }

  async enqueue_searchThenPutItemToCart(accessToken: BrowserLoginTokens, productQuery: string, quantity = 1) {
    return this.wegmansDao.searchThenPutItemToCart(accessToken, productQuery, quantity);
  }
}
