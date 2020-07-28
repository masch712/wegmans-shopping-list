import { config } from "../lib/config";
import { WegmansDao } from "../lib/WegmansDao";
import { BrowserLoginTokens, toCookieJar } from "../models/BrowserLoginTokens";
import request = require("request");
import { Cookie } from "tough-cookie";
import { productFactory } from "./TestDataFactory";
jest.setTimeout(3000000);

/***************************************************************
 * NOTE: IF YOU'RE SEEING TIMEOUTS, MAKE SURE YOU HAVE ALOCAL
 * DYNAMODB RUNNING
 * *************************************************************
 */

//Skip these normally; dont wanna spam wegmans
describe("wegmans dao", () => {
  const wegmans = new WegmansDao(config.get("wegmans.apikey"));
  let cookieJar = request.jar();
  let tokens: BrowserLoginTokens;
  beforeAll(async () => {
    tokens = await wegmans.login(config.get("wegmans.email"), config.get("wegmans.password"));
    cookieJar = toCookieJar(tokens);

    expect(tokens).toBeDefined();
    expect(tokens.session_token).toBeTruthy();
    expect(tokens.cookies).toBeTruthy();
  });

  test("search requires auth, booo", async () => {
    await 1;
  });

  test("deserialized serialized cookie is usable", async () => {
    const deserializedCookies = toCookieJar(tokens);

    const products = await wegmans.searchProducts(deserializedCookies, "strawberries", 10);
    expect(products).toBeTruthy();
  });

  test("refreshed cookie is usable", async () => {
    const freshTokens = await wegmans.refreshTokens(tokens);
    expect(freshTokens).not.toEqual(tokens);
    const freshCookieJar = toCookieJar(freshTokens);
    const products = await wegmans.searchProducts(freshCookieJar, "strawberries", 10);
    expect(products).toBeTruthy();
    tokens = freshTokens;
    cookieJar = freshCookieJar;
  });

  test("add (then remove) strawberries to shopping cart", async () => {
    const products = await wegmans.searchProducts(cookieJar, "frozen peas", 10);
    const cart_with_strawbs = await wegmans.putProductToCart(cookieJar, products[0]);
    expect(cart_with_strawbs.items.map((i) => i.store_product.id)).toContainEqual(products[0].id);

    const cart_without_strawbs = await wegmans.putProductToCart(cookieJar, products[0], 0);
    expect(cart_without_strawbs.items.map((i) => i.store_product.id)).not.toContainEqual(products[0].id);
  });

  describe.only("Re-use old wegmans tokens", () => {
    test("search, search", async () => {
      const oldCookieJar = toCookieJar({
        cookies: wegmans.serializeCookieJar(cookieJar),
        session_token: tokens.session_token,
      });
      const [product_first] = await wegmans.searchProducts(cookieJar, "frozen peas", 10);
      const [product_second] = await wegmans.searchProducts(oldCookieJar, "frozen peas", 10);

      expect(product_first).toEqual(product_second);
    });
    test.only("search, put to cart, seasrch", async () => {
      const oldCookieJar = toCookieJar({
        cookies: wegmans.serializeCookieJar(cookieJar),
        session_token: tokens.session_token,
      });

      const [product] = await wegmans.searchProducts(cookieJar, "frozen peas", 10);
      const cart = await wegmans.putProductToCart(cookieJar, product);

      const [product_second] = await wegmans.searchProducts(oldCookieJar, "frozen peas", 10);

      expect(product_second.id).toEqual(product.id);
    });
    //TODO: runthis same style of test but at the WegmansService layer instead; i.e. what is directly called from alexa handler.
    // gotta figure out why the search after adding to cart is failing...
    // What if I increase alexa handler timeout to sometihng huge??
  });

  describe("search products", () => {
    test("strawberries", async () => {
      const products = await wegmans.searchProducts(cookieJar, "strawberries", 10);
      expect(products).toBeTruthy();
    });
  });
  describe("search products purchased", () => {
    test("olive oil", async () => {
      const products = await wegmans.searchProductsPurchased(cookieJar, "olive oil", 10);
      expect(products).toBeTruthy();
    });
  });
  //TODO: revive the product search regression suite for the new API

  // describe("purchase history", () => {
  //   test("gets purchase history", async () => {
  //     const userId = getUsernameFromToken(tokens);
  //     await orderHistoryDao.delete(userId);
  //     const history = await wegmans.getOrderHistory(tokens.access, storeId, true);
  //     // cache should have good stuff
  //     if (history.cacheUpdatePromise) {
  //       await history.cacheUpdatePromise;
  //     }
  //     const orderedProducts = await orderHistoryDao.get(userId);
  //     expect(orderedProducts).not.toBeNull();
  //     expect(orderedProducts!.orderedProducts.length).toBeGreaterThan(0);
  //     expect(history.orderedProducts.length).toBeGreaterThan(0);
  //   });
  // });
  //TODO: write a test that mocks fuse to return no products.  make sure product comes from actual wegmans search
  //TODO: write unit tests that mock wegmans
});
