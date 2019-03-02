import * as _ from "lodash";
import * as request from "request-promise-native";
import { AccessToken } from "../models/AccessToken";
import { Product } from "../models/Product";
import { logger, logDuration } from "./Logger";
import { Response } from "request";
import { OrderedProduct } from "../models/OrderedProduct";
import { DateTime } from "luxon";
import { orderHistoryDao } from "./OrderHistoryDao";
import * as jwt from "jsonwebtoken";
import Fuse = require("fuse.js");
import { ProductSearch } from "./ProductSearch";

interface OrderHistoryResponseItem {
  LastPurchaseDate: string;
  Quantity: number;
  Sku: number;
}

export class WegmansDao {

  private apiKey: string;
  private shoppingListId: number | undefined;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  static getStoreIdFromTokens(token: AccessToken): number {
    // Temporary hack: return 59
    if (!token) {
      logger.warn('no user token yet; using 59');
      return 59;
    }
    const userToken = jwt.decode(token.user) as { [key: string]: number }; // TODO: make a real JWT type?
    const storeId = userToken!['wfa_profile_store'];
    return storeId;
  }

  async login(email: string, password: string): Promise<AccessToken> {
    let tokens: AccessToken | null = null;
    try {
      await request({
        method: "POST",
        url: "https://www.wegmans.com/j_security_check",
        headers:
        {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
        form:
        {
          j_username: email,
          j_password: password,
          j_staysigned: "on",
        },
      });
    } catch (err) {
      // We get a redirect response, which `request` considers an error.  whotevs
      const access = WegmansDao.getCookie(err.response, "wegmans_access");
      const refresh = WegmansDao.getCookie(err.response, "wegmans_refresh");
      const user = WegmansDao.getCookie(err.response, "wegmans_user");
      if (!access || !refresh || !user) {
        logger.debug(JSON.stringify(err, null, 2));
        throw new Error("No access tokens in response; bad login credentials?");
      }
      tokens = { access, refresh, user };
      logger.debug("Logged in and got access token of length " + access.length);
    }

    if (!tokens) {
      throw new Error("Expected tokens by now; where they at?");
    }

    return tokens;
  }

  // TODO: pull out auth shit into AcccessCodeDao and rename it to AuthDao
  /**
   * Send a refresh token to Wegmans and get back fresh access and user tokens.
   * @param refreshToken The refresh token
   */
  async refreshTokens(refreshToken: string, userToken: string): Promise<AccessToken> {

    try {
      const jar = request.jar();
      const refreshCookie = request.cookie(`wegmans_refresh=${refreshToken}`)!;
      const userCookie = request.cookie(`wegmans_user=${userToken}`)!;
      jar.setCookie(refreshCookie, "https://www.wegmans.com");
      jar.setCookie(userCookie, "https://www.wegmans.com");

      await request({
        method: "GET",
        jar,
        url: "https://www.wegmans.com/j_security_check",
        headers:
        {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
      });
    } catch (err) {
      // We get a redirect response, which `request` considers an error.  whotevs
      const access = WegmansDao.getCookie(err.response, "wegmans_access");
      const refresh = WegmansDao.getCookie(err.response, "wegmans_refresh");
      const user = WegmansDao.getCookie(err.response, "wegmans_user");
      if (!access || !refresh || !user) {
        logger.debug(JSON.stringify(err, null, 2));
        throw new Error("No access tokens in response; bad login credentials?");
      }
      const tokens: AccessToken = { access, refresh, user };
      logger.debug("Logged in and got access token of length " + access.length);
      return tokens;
    }

    throw new Error("Unable to refresh access token");
  }

  static getCookie(response: Response, cookieKey: string) {
    const cookie = _.find<string>(response.headers["set-cookie"],
      (cookie: string) => !!cookie.match(`${cookieKey}=`));
    if (!cookie) { return; }

    const value = cookie.substring(`${cookieKey}=`.length, cookie.indexOf(";"));
    return value;
  }

  async getShoppingListId(accessToken: string): Promise<number> {

    if (this.shoppingListId) {
      return this.shoppingListId;
    }

    const response = await request.get("https://wegapi.azure-api.net/shoppinglists/all/?api-version=1.0",
      {
        headers: {
          "Authorization": accessToken,
          "Ocp-Apim-Subscription-Key": this.apiKey,
        },
        json: true,
      });

    const shoppingListId = response[0].Id;
    this.shoppingListId = shoppingListId;

    return shoppingListId;
  }

  async addProductToShoppingList(accessToken: string, product: Product, quantity = 1): Promise<void> {
    const shoppingListId = await this.getShoppingListId(accessToken);
    const response = await request("https://wegapi.azure-api.net/shoppinglists/shoppinglistitem/my/?api-version=1.1",
      {
        method: "POST",
        qs: { "api-version": "1.1" },
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": this.apiKey,
          "Authorization": accessToken,
        },
        body: JSON.stringify([
          {
            ShoppingListId: shoppingListId,
            Quantity: quantity,
            Sku: product.sku,
          },
        ]),
        resolveWithFullResponse: true,
      });

    logger.debug("addProducttoShoppingList response status: " + response.statusCode);

    return;
  }

  async getOrderHistory(accessToken: string, storeId: number) {
    const userId = (jwt.decode(accessToken) as { sub: string }).sub;
    const orderHistory = await logDuration('orderHistoryDao.get(userId)', orderHistoryDao.get(userId));
    let orderedProducts: OrderedProduct[] = [];
    let updateCachePromise = undefined;

    // Update cache if oldre than 24 hours
    if (!orderHistory || !orderHistory.orderedProducts || !orderHistory.orderedProducts.length || orderHistory.lastCachedMillisSinceEpoch < new Date().valueOf() - 24*3600*1000) {
      logger.debug('order history cache miss');
      const response = await request({
        method: 'GET',
        url: `https://wegapi.azure-api.net/purchases/history/summary/${storeId}`,
        qs: {
          offset: 0,
          records: 1000,
          start: DateTime.local().plus({ days: -120 }).toFormat('MM/dd/yyyy'),
          end: DateTime.local().toFormat('MM/dd/yyyy'),
          onlineshopping: 'False',
          sortBy: 'popularity',
          sortOrder: 'desc',
          'api-version': '1.0'
        },
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          Authorization: accessToken,
          Accept: 'application/json',
        }
      });

      const body = JSON.parse(response) as OrderHistoryResponseItem[];
      orderedProducts = body.map(item => {
        const epochStr = item.LastPurchaseDate.substring(6, 19);
        const epoch = Number.parseInt(epochStr);
        const orderedProduct: OrderedProduct = {
          sku: item.Sku,
          purchaseMsSinceEpoch: epoch,
          quantity: item.Quantity,
        };
        return orderedProduct;
      });

      // Get the actual products.  These are useful later for in-memory fuzzy search
      const skus = orderedProducts.map(orderedProduct => orderedProduct.sku);
      const productsBySku = await ProductSearch.getProductBySku(skus.map(sku => `SKU_${sku}`), storeId);

      for (let index = orderedProducts.length - 1; index >= 0; index--) {
        const orderedProduct = orderedProducts[index];
        // The product may no longer exist, in which case its SKU won't be in productsBySku;
        // In that case, remove it from order history
        if (productsBySku[orderedProduct.sku]) {
          orderedProduct.product = productsBySku[orderedProduct.sku][0];
        }
        else {
          orderedProducts.splice(index, 1);
        }
      }

      logger.debug('writing order history to cache');
      updateCachePromise = orderHistoryDao.put(userId, orderedProducts)
        .then(() => { logger.debug('order history cache written'); });
    }
    else {
      logger.debug('order history cache hit');
      orderedProducts = orderHistory.orderedProducts;
    }

    const sortedOrderedProducts = _.sortBy(orderedProducts, (op: OrderedProduct) => op.sku);

    return {
      orderedProducts: sortedOrderedProducts,
      cacheUpdatePromise: updateCachePromise,
    };
  }
}
