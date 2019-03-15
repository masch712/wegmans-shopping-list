import * as request from "request-promise-native";
import { config } from "../lib/config";
import {WegmansDao} from "../lib/WegmansDao";
import { orderHistoryDao } from "../lib/OrderHistoryDao";
import { AccessToken } from "../models/AccessToken";
import { ProductSearch } from "../lib/ProductSearch";
jest.setTimeout(3000000);

/***************************************************************
 * NOTE: IF YOU'RE SEEING TIMEOUTS, MAKE SURE YOU HAVE ALOCAL
 * DYNAMODB RUNNING
 * *************************************************************
 */

//Skip these normally; dont wanna spam wegmans
describe('wegmans dao', () => {
  const wegmans = new WegmansDao(config.get('wegmans.apikey'));
  let tokens: AccessToken;
  let storeId: number;
  beforeAll(async () => {
    tokens = await wegmans.login(config.get('wegmans.email'), config.get('wegmans.password'));
    storeId = WegmansDao.getStoreIdFromTokens(tokens);
    expect(tokens).toBeDefined();
  });
  test('gets goat cheese', async () => {
    const goat = await ProductSearch.wegmansSearchForProduct('goat cheese', storeId);
    expect(goat).not.toBeNull();
    expect(goat!.subcategory).toEqual('Goat Cheese');
  });
  test('gets shopping list id', async () => {
    const shoppingListId = await wegmans.getShoppingListId(tokens.access);
    expect(shoppingListId).toBeGreaterThan(0);
  });
  test('adds goat cheese to list', async () => {
    const goat = await ProductSearch.wegmansSearchForProduct('goat cheese', storeId);
    await wegmans.addProductToShoppingList(tokens.access, goat!);
  });
  describe("purchase history", () => {
    test('gets purchase history', async () => {
      await orderHistoryDao.delete(config.get('wegmans.email'));
      const history = await wegmans.getOrderHistory(tokens.access, storeId, true);
      // cache should have good stuff
      if(history.cacheUpdatePromise) {
        await history.cacheUpdatePromise;
      }
      const orderedProducts = await orderHistoryDao.get(config.get('wegmans.email'));
      expect(orderedProducts).not.toBeNull();
      expect(orderedProducts!.orderedProducts.length).toBeGreaterThan(0);
      expect(history.orderedProducts.length).toBeGreaterThan(0);
    });
  });
  //TODO: write a test that mocks fuse to return no products.  make sure product comes from actual wegmans search
  //TODO: write unit tests that mock wegmans
});