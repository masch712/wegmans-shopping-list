import * as _ from "lodash";
import * as request from "./CancellableRequest";
import { AccessToken } from "../models/AccessToken";
import { Product } from "../models/Product";
import { logger, logDuration } from "./Logger";
import { Response, CookieJar } from "request";
import { OrderedProduct } from "../models/OrderedProduct";
import { DateTime } from "luxon";
import { orderHistoryDao } from "./OrderHistoryDao";
import * as jwt from "jsonwebtoken";
import Fuse = require("fuse.js");
import { config } from "../lib/config";
import { BasicAsyncQueueClient, WorkType } from "./BasicAsyncQueue";
import { AddToShoppingListWork, getWorkType as addToShoppingListWorkType } from "../lambda/workers/AddToShoppingList";
import {
  SearchThenAddToShoppingListWork,
  getWorkType as searchThenAddToShoppingListWorkType,
} from "../lambda/workers/SearchThenAddToShoppingList";
import jsdom = require("jsdom");
import jqueryBase = require("jquery");
import { BrowserLoginTokens } from "../models/BrowserLoginTokens";
import { deprecate } from "util";
interface OrderHistoryResponseItem {
  LastPurchaseDate: string;
  Quantity: number;
  Sku: number;
}

interface StoreProductSearchResult {
  item_count: number;
  items: StoreProductItem[];
}

interface StoreProductItem {
  id: string;
  name: string;
  reco_rating: number;
  product_rating: {
    average_rating: number;
    user_count: number;
  };
  fulfillment_types: string[];
  tags: string[];
}

const CLIENT_ID = "7c0edc2c-5aa9-4a85-9ab0-ae11c5bb251e"; //This appears to be statically set in wegmans JS static content

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

  async login(cookieJar: CookieJar, email: string, password: string): Promise<BrowserLoginTokens> {
    // 1. Request a login page (oath2/v2.0/authorize)
    // 2. Scrape out the needful codes from the response (jquery )
    // 3. Build a login request
    // 4. Capture the token

    // 1.
    const oauthRes = await request({
      method: "GET",
      url: "https://myaccount.wegmans.com/wegmansonline.onmicrosoft.com/oauth2/v2.0/authorize",
      qs: {
        client_id: CLIENT_ID,
        p: "B2C_1A_signup_signin",
        state: "B2C_1A_signup_signin",
        redirect_uri: "https://shop.wegmans.com/social-redirect/wegmans_idp",
        response_type: "code",
        scope: `${CLIENT_ID} offline_access`,
      },
      headers: { pragma: "no-cache", "cache-control": "no-cache" },
      jar: cookieJar,
    });
    // We gotta execute some js in the response page in order to get the "tx" query param for the next step
    const jquery = jqueryBase(new jsdom.JSDOM(oauthRes).window);
    const jsDataContainer = jquery.find("head script[data-container]")[0].text;
    const settings = eval("'use strict'; " + jsDataContainer + " SETTINGS;");
    const tx = settings.transId;

    const csrfCookie = cookieJar
      .getCookies("https://myaccount.wegmans.com")
      .find((cookie) => cookie.key === "x-ms-cpim-csrf")?.value;
    const loginRes = await request({
      method: "POST",
      url: "https://myaccount.wegmans.com/wegmansonline.onmicrosoft.com/B2C_1A_signup_signin/SelfAsserted",
      qs: {
        tx,
        p: "B2C_1A_signup_signin",
      },
      headers: {
        "X-CSRF-TOKEN": csrfCookie,
      },
      form: {
        request_type: "RESPONSE",
        signInName: email,
        password,
      },
      jar: cookieJar,
    });

    const getRedirect = await request({
      method: "GET",
      url:
        "https://myaccount.wegmans.com/wegmansonline.onmicrosoft.com/B2C_1A_signup_signin/api/CombinedSigninAndSignup/confirmed",
      qs: {
        rememberMe: false,
        csrf_token: csrfCookie,
        tx,
        p: "B2C_1A_signup_signin",
      },
      jar: cookieJar,
      followRedirect: false,
      simple: false,
      resolveWithFullResponse: true,
    });

    const redirectLocation = getRedirect.headers.location;
    // Sick.  If I browse to this redirectLocation in an incognito browser, it brings me to my wegmans account.
    // Time to extract the tokens I need for the wegmans API...
    // Making some guesses here on the requests I need to make to stack my shop.wegmans.com cookies so I can make API requests:
    // 1. (?) https://shop.wegmans.com/api/v2/facts/frontend_configs
    // 2. https://shop.wegmans.com/api/v2/user_sessions
    // 3.

    await this.createUserSession(cookieJar);

    // // it's normal for userSessions.body.session_token JWT to have a null user_id at this point

    //TODO: do i need this request?
    const users = await request({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      url: "https://shop.wegmans.com/api/v2/users",
      body: JSON.stringify({}),
      jar: cookieJar,
      followRedirect: false,
      simple: false,
      resolveWithFullResponse: true,
    });

    const auth = await request({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      url: "https://shop.wegmans.com/api/v2/auth/external",
      body: JSON.stringify({
        identifier_polytype: "wegmans_idp",
        identifier_data: {
          redirect_response: redirectLocation,
        },
      }),
      jar: cookieJar,
      followRedirect: false,
      simple: false,
      resolveWithFullResponse: true,
    });

    // OOOOOHH this is returning the right shit! we fuckin did it!
    const user = await request({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      url: "https://shop.wegmans.com/api/v2/user",
      jar: cookieJar,
      followRedirect: false,
      simple: false,
      resolveWithFullResponse: true,
    });

    const userSessions = await this.createUserSession(cookieJar);

    const tokens: BrowserLoginTokens = {
      session_token: JSON.parse(userSessions.body).session_token,
      cookies: cookieJar.getCookies("https://shop.wegmans.com").map((c) => c.toString()),
    };
    if (!tokens) {
      throw new Error("Expected tokens by now; where they at?");
    }

    return tokens;
  }

  // seems like we can refresh tokens by sending a GET to /user which sets a new session-prd-weg
  public async refreshTokens(tokens: BrowserLoginTokens): Promise<BrowserLoginTokens> {
    const cookieJar = request.jar();
    tokens.cookies.forEach((c) => cookieJar.setCookie(c, "https://shop.wegmans.com"));

    await this.getUser(cookieJar);

    // Do I actually need to get this new session_token here?  Who knows.
    const userSessions = await this.createUserSession(cookieJar);

    return {
      session_token: JSON.parse(userSessions.body).session_token,
      cookies: cookieJar.getCookies("https://shop.wegmans.com").map((c) => c.toString()),
    };
  }

  public async searchProducts(cookieJar: CookieJar, productQuery: string, limit = 60, offset = 0) {
    const response = await request({
      method: "GET",
      url: "https://shop.wegmans.com/api/v2/store_products",
      headers: {
        "Content-Type": "application/json",
      },
      qs: {
        search_term: productQuery,
        limit,
        offset,
        sort: "rank",
      },
      jar: cookieJar,
    });

    // TODO: handle error responses?
    const storeProductSearchResult = JSON.parse(response) as StoreProductSearchResult;

    return storeProductSearchResult.items;
  }

  public async searchProductsPurchased(cookieJar: CookieJar, productQuery: string, limit = 60, offset = 0) {
    const response = await request({
      method: "GET",
      url: "https://shop.wegmans.com/api/v2/store_products",
      headers: {
        "Content-Type": "application/json",
      },
      qs: {
        search_term: productQuery,
        limit,
        offset,
        sort: "rank",
        tags: "purchased",
      },
      jar: cookieJar,
    });

    // TODO: handle error responses?
    const storeProductSearchResult = JSON.parse(response) as StoreProductSearchResult;

    return storeProductSearchResult.items;
  }

  private async getUser(cookieJar: CookieJar) {
    return await request({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      url: "https://shop.wegmans.com/api/v2/user",
      jar: cookieJar,
      followRedirect: false,
      simple: false,
      resolveWithFullResponse: true,
    });
  }

  /**
   * Sets a session-prd-weg cookie on the given cookie jar.
   * @param cookieJar
   */
  private async createUserSession(cookieJar: CookieJar) {
    return await request({
      method: "POST",
      url: "https://shop.wegmans.com/api/v2/user_sessions",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:78.0) Gecko/20100101 Firefox/78.0",
      },
      body: JSON.stringify({
        binary: "web-ecom",
        binary_version: "2.27.244",
        is_retina: false,
        os_version: "Linux x86_64",
        pixel_density: "1.0",
        push_token: "",
        screen_height: 1080,
        screen_width: 1920,
      }),
      jar: cookieJar,
      followRedirect: false,
      simple: false,
      resolveWithFullResponse: true,
    });
  }

  // TODO: pull out auth shit into AcccessCodeDao and rename it to AuthDao
  /**
   * Send a refresh token to Wegmans and get back fresh access and user tokens.
   * @param refreshToken The refresh token
   */
  // async refreshTokens(refreshToken: string, userToken: string): Promise<AccessToken> {
  //   let res: any;
  //   try {
  //     const jar = request.jar();
  //     const refreshCookie = request.cookie(`wegmans_refresh=${refreshToken}`)!;
  //     const userCookie = request.cookie(`wegmans_user=${userToken}`)!;
  //     jar.setCookie(refreshCookie, "https://www.wegmans.com");
  //     jar.setCookie(userCookie, "https://www.wegmans.com");

  //     res = await request({
  //       method: "GET",
  //       jar,
  //       url: "https://www.wegmans.com/j_security_check",
  //       headers: {
  //         "Content-Type": "application/x-www-form-urlencoded",
  //         "Cache-Control": "no-cache",
  //       },
  //     });
  //   } catch (err) {
  //     // We get a redirect response, which `request` considers an error.  whotevs
  //     const access = WegmansDao.getCookie(err.response, "wegmans_access");
  //     const refresh = WegmansDao.getCookie(err.response, "wegmans_refresh");
  //     const user = WegmansDao.getCookie(err.response, "wegmans_user");
  //     if (!access || !refresh || !user) {
  //       logger().debug(JSON.stringify(err, null, 2));
  //       throw new Error("No access tokens in response; bad login credentials?");
  //     }
  //     const tokens: AccessToken = { access, refresh, user };
  //     logger().debug("Logged in and got access token of length " + access.length);
  //     return tokens;
  //   }

  //   throw new Error("Unable to refresh access token");
  // }

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
        "Ocp-Apim-Subscription-Key": this.apiKey,
      },
      json: true,
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
          accessToken,
        },
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
          note,
        },
      })
    );
  }

  async putProductToCart(cookieJar: CookieJar, product: StoreProductItem) {
    const response = await request({
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      url: "https://shop.wegmans.com/api/v2/cart",
      body: JSON.stringify({
        items: [
          {
            id: product.id,
            quantity: 1,
            store_product: product,
            item_type: "store_product",
          },
        ],
      }),
    });
    return;
  }

  async addProductToShoppingList(accessToken: string, product: Product, quantity = 1, note: string): Promise<void> {
    const shoppingListId = await this.getShoppingListId(accessToken);
    const response = await request("https://wegapi.azure-api.net/shoppinglists/shoppinglistitem/my/?api-version=1.1", {
      method: "POST",
      qs: { "api-version": "1.1" },
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": this.apiKey,
        Authorization: accessToken,
      },
      body: JSON.stringify([
        {
          ShoppingListId: shoppingListId,
          Quantity: quantity,
          Sku: product.sku,
          Note: note,
        },
      ]),
      resolveWithFullResponse: true,
    });

    logger().debug("addProducttoShoppingList response status: " + response.statusCode);

    return;
  }

  //TODO: refactor this garbage
  async getOrderHistory(accessToken: string, storeId: number, forceCacheUpdate?: boolean) {
    // const userId = (jwt.decode(accessToken) as { sub: string }).sub;
    // const orderHistory = await logDuration("orderHistoryDao.get(userId)", orderHistoryDao.get(userId));
    // let orderedProducts: OrderedProduct[] = [];
    // let updateCachePromise = undefined;
    // logger().debug("gotOrderHistoryCachedAt: " + (orderHistory && orderHistory.lastCachedMillisSinceEpoch));
    // // Update cache if oldre than 24 hours
    // if (
    //   !orderHistory ||
    //   !orderHistory.orderedProducts ||
    //   !orderHistory.orderedProducts.length ||
    //   orderHistory.lastCachedMillisSinceEpoch < DateTime.utc().valueOf() - 24 * 3600 * 1000 ||
    //   orderHistory.lastCachedMillisSinceEpoch < 1551646031169 || // Before 3/3/2019, when I fixed a bug that requires me to re-cache order history
    //   forceCacheUpdate
    // ) {
    //   logger().debug("order history cache miss");
    //   const response = await logDuration(
    //     "wegmansRequestOrderHistory",
    //     request({
    //       method: "GET",
    //       url: `https://wegapi.azure-api.net/purchases/history/summary/${storeId}`,
    //       qs: {
    //         offset: 0,
    //         records: 1000,
    //         start: DateTime.local().plus({ days: -120 }).toFormat("MM/dd/yyyy"),
    //         end: DateTime.local().toFormat("MM/dd/yyyy"),
    //         onlineshopping: "False",
    //         sortBy: "popularity",
    //         sortOrder: "desc",
    //         "api-version": "1.0",
    //       },
    //       headers: {
    //         "Ocp-Apim-Subscription-Key": this.apiKey,
    //         Authorization: accessToken,
    //         Accept: "application/json",
    //       },
    //     }).then(_.identity())
    //   ); //TODO: wtf is up with ts and this _.identity business?  return type undefined?
    //   const body = JSON.parse(response) as OrderHistoryResponseItem[];
    //   orderedProducts = body.map((item) => {
    //     const epochStr = item.LastPurchaseDate.substring(6, 19);
    //     const epoch = Number.parseInt(epochStr, 10);
    //     const orderedProduct: OrderedProduct = {
    //       sku: item.Sku,
    //       purchaseMsSinceEpoch: epoch,
    //       quantity: item.Quantity,
    //     };
    //     return orderedProduct;
    //   });
    //   // Get the actual products.  These are useful later for in-memory fuzzy search
    //   const skus = orderedProducts.map((orderedProduct) => orderedProduct.sku);
    //   //TODO: this seems....slow
    //   const productsBySku = await logDuration(
    //     "map_getProductBySku",
    //     ProductSearch.getProductBySku(
    //       skus.map((sku) => `SKU_${sku}`),
    //       storeId
    //     )
    //   );
    //   for (let index = orderedProducts.length - 1; index >= 0; index--) {
    //     const orderedProduct = orderedProducts[index];
    //     // The product may no longer exist, in which case its SKU won't be in productsBySku;
    //     // In that case, remove it from order history
    //     if (productsBySku[orderedProduct.sku]) {
    //       orderedProduct.product = productsBySku[orderedProduct.sku][0];
    //     } else {
    //       orderedProducts.splice(index, 1);
    //     }
    //   }
    //   logger().debug("writing order history to cache");
    //   updateCachePromise = orderHistoryDao.put(userId, orderedProducts).then(() => {
    //     logger().debug("order history cache written");
    //   });
    // } else {
    //   logger().debug("order history cache hit");
    //   orderedProducts = orderHistory.orderedProducts;
    // }
    // const sortedOrderedProducts = _.sortBy(orderedProducts, (op: OrderedProduct) => op.sku);
    // return {
    //   orderedProducts: sortedOrderedProducts,
    //   cacheUpdatePromise: updateCachePromise,
    // };
  }
}
