import * as _ from "lodash";
import * as request from "./CancellableRequest";
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
import { config } from "../lib/config";
import { BasicAsyncQueueClient, WorkType } from "./BasicAsyncQueue";
import { AddToShoppingListWork, getWorkType as addToShoppingListWorkType } from "../lambda/workers/AddToShoppingList";
import {
  SearchThenAddToShoppingListWork,
  getWorkType as searchThenAddToShoppingListWorkType
} from "../lambda/workers/SearchThenAddToShoppingList";

interface OrderHistoryResponseItem {
  LastPurchaseDate: string;
  Quantity: number;
  Sku: number;
}

export class WegmansDao {
  private apiKey: string;
  private shoppingListId: number | undefined;

  private addToShoppingListWorkQueue: BasicAsyncQueueClient<AddToShoppingListWork>;
  private searchThenAddToShoppingListWorkQueue: BasicAsyncQueueClient<SearchThenAddToShoppingListWork>;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.addToShoppingListWorkQueue = new BasicAsyncQueueClient(addToShoppingListWorkType());
    this.searchThenAddToShoppingListWorkQueue = new BasicAsyncQueueClient(searchThenAddToShoppingListWorkType());
  }

  async login(email: string, password: string): Promise<AccessToken> {
    let tokens: AccessToken | null = null;
    try {
      await request({
        method: "POST",
        url: "https://www.wegmans.com/j_security_check",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache"
        },
        form: {
          j_username: email,
          j_password: password,
          j_staysigned: "on"
        }
      });
    } catch (err) {
      // We get a redirect response, which `request` considers an error.  whotevs
      const access = WegmansDao.getCookie(err.response, "wegmans_access");
      const refresh = WegmansDao.getCookie(err.response, "wegmans_refresh");
      const user = WegmansDao.getCookie(err.response, "wegmans_user");
      if (!access || !refresh || !user) {
        // BEWARE: might contain  password; do not log
        // logger().debug(JSON.stringify(err, null, 2));
        throw new Error("No access tokens in response; bad login credentials?");
      }
      tokens = { access, refresh, user };
      logger().debug("Logged in and got access token of length " + access.length);
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
    let res: any;
    try {
      const jar = request.jar();
      const refreshCookie = request.cookie(`wegmans_refresh=${refreshToken}`)!;
      const userCookie = request.cookie(`wegmans_user=${userToken}`)!;
      jar.setCookie(refreshCookie, "https://www.wegmans.com");
      jar.setCookie(userCookie, "https://www.wegmans.com");

      res = await request({
        method: "GET",
        jar,
        url: "https://www.wegmans.com/j_security_check",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache"
        }
      });
    } catch (err) {
      // We get a redirect response, which `request` considers an error.  whotevs
      const access = WegmansDao.getCookie(err.response, "wegmans_access");
      const refresh = WegmansDao.getCookie(err.response, "wegmans_refresh");
      const user = WegmansDao.getCookie(err.response, "wegmans_user");
      if (!access || !refresh || !user) {
        logger().debug(JSON.stringify(err, null, 2));
        throw new Error("No access tokens in response; bad login credentials?");
      }
      const tokens: AccessToken = { access, refresh, user };
      logger().debug("Logged in and got access token of length " + access.length);
      return tokens;
    }

    throw new Error("Unable to refresh access token");
  }

  static getCookie(response: Response, cookieKey: string) {
    const cookie = _.find<string>(response.headers["set-cookie"], (cookie: string) => !!cookie.match(`${cookieKey}=`));
    if (!cookie) {
      return;
    }

    const value = cookie.substring(`${cookieKey}=`.length, cookie.indexOf(";"));
    return value;
  }

  async getShoppingListId(accessToken: string): Promise<number> {
    if (this.shoppingListId) {
      return this.shoppingListId;
    }

    const response = await request.get("https://wegapi.azure-api.net/shoppinglists/all/?api-version=1.0", {
      headers: {
        Authorization: accessToken,
        "Ocp-Apim-Subscription-Key": this.apiKey
      },
      json: true
    });

    const shoppingListId = response[0].Id;
    this.shoppingListId = shoppingListId;

    return shoppingListId;
  }

  async enqueue_searchThenAddProductToShoppingList(accessToken: AccessToken, productQuery: string, quantity: number) {
    await logDuration(
      "enqueue_searchAndAddProductToShoppingList",
      this.searchThenAddToShoppingListWorkQueue.enqueue({
        payload: {
          productQuery,
          quantity,
          accessToken
        }
      })
    );
  }

  async enqueue_addProductToShoppingList(
    accessToken: string,
    product: Product,
    quantity = 1,
    note: string
  ): Promise<void> {
    await logDuration(
      "enqueue_addProductToShoppingList",
      this.addToShoppingListWorkQueue.enqueue({
        payload: {
          accessToken,
          product,
          quantity,
          note
        }
      })
    );
  }

  async addProductToShoppingList(accessToken: string, product: Product, quantity = 1, note: string): Promise<void> {
    const shoppingListId = await this.getShoppingListId(accessToken);
    const response = await request("https://wegapi.azure-api.net/shoppinglists/shoppinglistitem/my/?api-version=1.1", {
      method: "POST",
      qs: { "api-version": "1.1" },
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": this.apiKey,
        Authorization: accessToken
      },
      body: JSON.stringify([
        {
          ShoppingListId: shoppingListId,
          Quantity: quantity,
          Sku: product.sku,
          Note: note
        }
      ]),
      resolveWithFullResponse: true
    });

    logger().debug("addProducttoShoppingList response status: " + response.statusCode);

    return;
  }

  //TODO: refactor this garbage
  async getOrderHistory(accessToken: string, storeId: number, forceCacheUpdate?: boolean) {
    const userId = (jwt.decode(accessToken) as { sub: string }).sub;
    const orderHistory = await logDuration("orderHistoryDao.get(userId)", orderHistoryDao.get(userId));
    let orderedProducts: OrderedProduct[] = [];
    let updateCachePromise = undefined;

    logger().debug("gotOrderHistoryCachedAt: " + (orderHistory && orderHistory.lastCachedMillisSinceEpoch));

    // Update cache if oldre than 24 hours
    if (
      !orderHistory ||
      !orderHistory.orderedProducts ||
      !orderHistory.orderedProducts.length ||
      orderHistory.lastCachedMillisSinceEpoch < DateTime.utc().valueOf() - 24 * 3600 * 1000 ||
      orderHistory.lastCachedMillisSinceEpoch < 1551646031169 || // Before 3/3/2019, when I fixed a bug that requires me to re-cache order history
      forceCacheUpdate
    ) {
      logger().debug("order history cache miss");
      const response = await logDuration(
        "wegmansRequestOrderHistory",
        request({
          method: "GET",
          url: `https://wegapi.azure-api.net/purchases/history/summary/${storeId}`,
          qs: {
            offset: 0,
            records: 1000,
            start: DateTime.local()
              .plus({ days: -120 })
              .toFormat("MM/dd/yyyy"),
            end: DateTime.local().toFormat("MM/dd/yyyy"),
            onlineshopping: "False",
            sortBy: "popularity",
            sortOrder: "desc",
            "api-version": "1.0"
          },
          headers: {
            "Ocp-Apim-Subscription-Key": this.apiKey,
            Authorization: accessToken,
            Accept: "application/json"
          }
        }).then(_.identity())
      ); //TODO: wtf is up with ts and this _.identity business?  return type undefined?

      const body = JSON.parse(response) as OrderHistoryResponseItem[];
      orderedProducts = body.map(item => {
        const epochStr = item.LastPurchaseDate.substring(6, 19);
        const epoch = Number.parseInt(epochStr, 10);
        const orderedProduct: OrderedProduct = {
          sku: item.Sku,
          purchaseMsSinceEpoch: epoch,
          quantity: item.Quantity
        };
        return orderedProduct;
      });

      // Get the actual products.  These are useful later for in-memory fuzzy search
      const skus = orderedProducts.map(orderedProduct => orderedProduct.sku);
      //TODO: this seems....slow
      const productsBySku = await logDuration(
        "map_getProductBySku",
        ProductSearch.getProductBySku(
          skus.map(sku => `SKU_${sku}`),
          storeId
        )
      );

      for (let index = orderedProducts.length - 1; index >= 0; index--) {
        const orderedProduct = orderedProducts[index];
        // The product may no longer exist, in which case its SKU won't be in productsBySku;
        // In that case, remove it from order history
        if (productsBySku[orderedProduct.sku]) {
          orderedProduct.product = productsBySku[orderedProduct.sku][0];
        } else {
          orderedProducts.splice(index, 1);
        }
      }

      logger().debug("writing order history to cache");
      updateCachePromise = orderHistoryDao.put(userId, orderedProducts).then(() => {
        logger().debug("order history cache written");
      });
    } else {
      logger().debug("order history cache hit");
      orderedProducts = orderHistory.orderedProducts;
    }

    const sortedOrderedProducts = _.sortBy(orderedProducts, (op: OrderedProduct) => op.sku);

    return {
      orderedProducts: sortedOrderedProducts,
      cacheUpdatePromise: updateCachePromise
    };
  }
}
