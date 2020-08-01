import * as _ from "lodash";
import * as request from "./CancellableRequest";
import { WedgiesOAuthToken } from "../models/AccessToken";
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
import { PutItemToCartWork, getWorkType as addToShoppingListWorkType } from "../lambda/workers/PutItemToCart";
import {
  SearchThenPutItemToCartWork,
  getWorkType as searchThenAddToShoppingListWorkType,
} from "../lambda/workers/SearchThenAddToShoppingList";
import jsdom = require("jsdom");
import jqueryBase = require("jquery");
import { BrowserLoginTokens, toCookieJar, CookieStringByKey } from "../models/BrowserLoginTokens";
import { deprecate } from "util";
import { StoreProductItem } from "../models/StoreProductItem";
import { Cart } from "../models/Cart";
import { Orders as OrderSummaries, OrderDetail } from "../models/Orders";
interface OrderHistoryResponseItem {
  LastPurchaseDate: string;
  Quantity: number;
  Sku: number;
}

interface StoreProductSearchResult {
  item_count: number;
  items: StoreProductItem[];
}

const CLIENT_ID = "7c0edc2c-5aa9-4a85-9ab0-ae11c5bb251e"; //This appears to be statically set in wegmans JS static content

export class WegmansDao {
  private apiKey: string;
  private shoppingListId: number | undefined;

  private putItemToCardWorkQueue: BasicAsyncQueueClient<PutItemToCartWork>;
  private searchThenPutItemToCartWorkQueue: BasicAsyncQueueClient<SearchThenPutItemToCartWork>;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.putItemToCardWorkQueue = new BasicAsyncQueueClient(addToShoppingListWorkType());
    this.searchThenPutItemToCartWorkQueue = new BasicAsyncQueueClient(searchThenAddToShoppingListWorkType());
  }

  async login(email: string, password: string): Promise<BrowserLoginTokens> {
    // 1. Request a login page (oath2/v2.0/authorize)
    // 2. Scrape out the needful codes from the response (jquery )
    // 3. Build a login request
    // 4. Capture the token

    // 1.
    const cookieJar = request.jar();
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
    const jsDataContainer = jquery.find("head script[data-container]")[0].textContent;
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
      cookies: this.serializeCookieJar(cookieJar),
    };
    if (!tokens) {
      throw new Error("Expected tokens by now; where they at?");
    }

    return tokens;
  }

  public serializeCookieJar(cookieJar: CookieJar): CookieStringByKey {
    return cookieJar.getCookies("https://shop.wegmans.com").reduce<CookieStringByKey>((prev, curr) => {
      prev[curr.key] = curr.toString();
      return prev;
    }, {});
  }

  // seems like we can refresh tokens by sending a GET to /user which sets a new session-prd-weg
  public async refreshTokens(tokens: BrowserLoginTokens): Promise<BrowserLoginTokens> {
    const cookieJar = toCookieJar(tokens);

    await this.getUser(cookieJar);

    // Do I actually need to get this new session_token here?  Who knows.
    const userSessions = await this.createUserSession(cookieJar);

    return {
      session_token: JSON.parse(userSessions.body).session_token,
      cookies: this.serializeCookieJar(cookieJar),
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

    return storeProductSearchResult.items || [];
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

  async searchThenPutItemToCart(wegmansTokens: BrowserLoginTokens, productQuery: string, quantity: number) {
    await logDuration(
      "enqueue_searchThenPutItemToCartWorkQueue",
      this.searchThenPutItemToCartWorkQueue.enqueue({
        payload: {
          productQuery,
          quantity,
          wegmansTokens,
        },
      })
    );
  }

  async enqueue_putItemToCart(
    wegmansTokens: BrowserLoginTokens,
    product: StoreProductItem,
    quantity = 1,
    note: string
  ): Promise<void> {
    await logDuration(
      "enqueue_putItemToCart",
      this.putItemToCardWorkQueue.enqueue({
        payload: {
          wegmansTokens,
          product,
          quantity,
          note,
        },
      })
    );
  }

  async putProductToCart(cookieJar: CookieJar, product: StoreProductItem, quantity = 1): Promise<Cart> {
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
            quantity,
            store_product: product,
            item_type: "store_product",
            order_by_weight: false,
            product_config: null,
          },
        ],
      }),
      jar: cookieJar,
    });
    const cart = JSON.parse(response) as Cart;
    return cart;
  }

  async getCart(cookieJar: CookieJar): Promise<Cart> {
    const response = await request({
      method: "GET",
      // headers: {
      //   "Content-Type": "application/json",
      // },
      url: "https://shop.wegmans.com/api/v2/cart",
      jar: cookieJar,
    });
    const cart = JSON.parse(response) as Cart;
    return cart;
  }

  async getNextOrder(cookieJar: CookieJar) {
    const ordersResponse = await request({
      method: "GET",
      // headers: {
      //   "Content-Type": "application/json",
      // },
      url: "https://shop.wegmans.com/api/v2/orders",
      jar: cookieJar,
    });
    const orders = JSON.parse(ordersResponse) as OrderSummaries;
    //TODO: throw if no order
    if (orders.item_count < 1) {
      return null;
    }

    const nextOrderResponse = await request({
      method: "GET",
      url: `https://shop.wegmans.com/api/v2/orders/${orders.items[0].id}`,
    });

    const order = JSON.parse(nextOrderResponse) as OrderDetail;
    return order;
  }

  async addProductToOrder(cookieJar: CookieJar, order: OrderDetail, product: StoreProductItem) {
    /**
     * GET order
     * POST cart/modify_order
     * validate cart?
     * do some payment API shits?
     */
    const nextOrder = await this.getNextOrder(cookieJar);
    await request({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      url: "https://shop.wegmans.com/api/v2/cart/modify_order",
      body: JSON.stringify({
        order: nextOrder,
      }),
      jar: cookieJar,
    });
    // await fetch("https://shop.wegmans.com/api/v2/cart/validate", {
    //   credentials: "include",
    //   headers: {
    //     "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:78.0) Gecko/20100101 Firefox/78.0",
    //     Accept: "*/*",
    //     "Accept-Language": "en-US,en;q=0.5",
    //     "Content-Type": "application/json",
    //     "User-Context": "eyJTdG9yZUlkIjoiNzIiLCJGdWxmaWxsbWVudFR5cGUiOiJwaWNrdXAifQ==",
    //     Pragma: "no-cache",
    //     "Cache-Control": "no-cache",
    //   },
    //   referrer: "https://shop.wegmans.com/checkout/v2/review",
    //   body:
    //     {"with_fees":true,"timeslot":{"allow_alcohol":null,"banner_id":1,"cutoff_delta":null,"day_of_week":"friday","delivery_fee":null,"delivery_fee_plu":null,"exp":1596107001,"ext_id":"174229950","from_time":"10:00:00","fulfillment_type":"pickup","iat":1596105801,"id":"1284729","is_free":null,"jwt_token":"eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyODQ3MjkiLCJwb2x5dHlwZSI6InNjaGVkdWxlZCIsImZ1bGZpbGxtZW50X3R5cGUiOiJwaWNrdXAiLCJkYXlfb2Zfd2VlayI6ImZyaWRheSIsImZyb21fdGltZSI6IjEwOjAwOjAwIiwidG9fdGltZSI6IjExOjAwOjAwIiwid2l0aGluX2hvdXJzIjpudWxsLCJhbGxvd19hbGNvaG9sIjpudWxsLCJsYWJlbCI6bnVsbCwidW5hdmFpbGFibGUiOmZhbHNlLCJ1bmF2YWlsYWJpbGl0eV9yZWFzb25zIjpudWxsLCJwb3N0YWxfY29kZXMiOltdLCJleHRfaWQiOiIxNzQyMjk5NTAiLCJpc19mcmVlIjpudWxsLCJzaG9wX2ZlZV9wbHUiOm51bGwsInNob3BfZmVlIjoiMC4wMCIsIm9yaWdpbmFsX3Nob3BfZmVlIjpudWxsLCJkZWxpdmVyeV9mZWVfcGx1IjpudWxsLCJkZWxpdmVyeV9mZWUiOm51bGwsIm9yaWdpbmFsX2RlbGl2ZXJ5X2ZlZSI6bnVsbCwic291cmNlIjoiaWNfdGltZXNsb3QiLCJjdXRvZmZfZGVsdGEiOm51bGwsImJhbm5lcl9pZCI6MSwiaWF0IjoxNTk2MTA1ODAxLCJleHAiOjE1OTYxMDcwMDF9.w1PaRizug5MzCpCZ8pD99qoB02BBsNgd6iQlX96hJIA","label":null,"original_delivery_fee":null,"original_shop_fee":null,"polytype":"scheduled","postal_codes":[],"shop_fee":"0.00","shop_fee_plu":null,"source":"ic_timeslot","to_time":"11:00:00","unavailability_reasons":null,"unavailable":false,"within_hours":null},"user_birthday":"1989-09-13T04:00:00.000Z","store":{"address":{"address1":"53 Third Avenue","address2":null,"address3":null,"city":"Burlington","country":"USA","postal_code":"01803","province":"MASSACHUSETTS"},"amenities":"Coin Counting Kiosk, Lottery, Wi-Fi Internet Access","banner":"wegmans","ext_id":"59","external_url":"https://www.wegmans.com/stores/burlington-ma","has_catering":null,"has_delivery":true,"has_ecommerce":true,"has_pickup":true,"href":"/stores/72","id":"72","is_b2b":false,"last_purchased":"2020-07-24T04:00:00+00:00","location":{"latitude":"42.48690","longitude":"-71.22570"},"name":"BURLINGTON","partial":null,"payment_types":{"delivery":["auth_capture"],"pickup":["auth_capture"]},"phone_number":"781-418-0700","show_catering":null,"show_delivery":true,"show_ecommerce":true,"show_pickup":true,"store_banner":{"ext_id":"231","key":"wegmans","name":"wegmans"},"store_hours":null},"contact_info":{"first_name":"Mary","last_name":"Asch","phone_number":"7816082759"},"cart_id":450937},
    //   method: "POST",
    //   mode: "cors",
    // });
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
