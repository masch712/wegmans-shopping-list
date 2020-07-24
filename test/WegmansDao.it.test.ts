import { config } from "../lib/config";
import { WegmansDao } from "../lib/WegmansDao";
import { BrowserLoginTokens, toCookieJar } from "../models/BrowserLoginTokens";
import request = require("request");
import { Cookie } from "tough-cookie";
jest.setTimeout(3000000);

/***************************************************************
 * NOTE: IF YOU'RE SEEING TIMEOUTS, MAKE SURE YOU HAVE ALOCAL
 * DYNAMODB RUNNING
 * *************************************************************
 */

//Skip these normally; dont wanna spam wegmans
describe("wegmans dao", () => {
  const wegmans = new WegmansDao(config.get("wegmans.apikey"));
  const cookieJar = request.jar();
  let tokens: BrowserLoginTokens;
  beforeAll(async () => {
    tokens = await wegmans.login(cookieJar, config.get("wegmans.email"), config.get("wegmans.password"));
    expect(tokens).toBeDefined();
    expect(tokens.session_token).toBeTruthy();
    expect(tokens.cookies).toBeTruthy();
    // storeId = getStoreIdFromTokens(tokens);
  });

  test("search requires auth, booo", async () => {
    await 1;
  });

  test.only("deserialized serialized cookie is usable", async () => {
    const deserializedCookies = toCookieJar(tokens);

    const products = await wegmans.searchProducts(deserializedCookies, "strawberries", 10);
    expect(products).toBeTruthy();
  });

  test.only("refreshed cookie is usable", async () => {
    const freshTokens = await wegmans.refreshTokens(tokens);
    expect(freshTokens).not.toEqual(tokens);
    const freshCookieJar = toCookieJar(freshTokens);
    const products = await wegmans.searchProducts(freshCookieJar, "strawberries", 10);
    expect(products).toBeTruthy();
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

  // test.only("refreshes token", async () => {
  //   const freshTokens = await wegmans.refreshTokens(tokens.refresh, tokens.user);
  //   expect(freshTokens.access).toBeDefined();
  // });
  // test("gets shopping list id", async () => {
  //   const shoppingListId = await wegmans.getShoppingListId(tokens.access);
  //   expect(shoppingListId).toBeGreaterThan(0);
  // });
  // test("adds goat cheese to list", async () => {
  //   const [goat] = await ProductSearch.wegmansSearchForProduct("goat cheese", storeId);
  //   await wegmans.addProductToShoppingList(tokens.access, goat!, 1, "IGNORE ME");
  // });
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
