import * as request from "request-promise-native";
import { config } from "../lib/config";
import {WegmansDao} from "../lib/WegmansDao";
import { orderHistoryDao } from "../lib/OrderHistoryDao";
import { AccessToken } from "../models/AccessToken";
import { ProductSearch } from "../lib/ProductSearch";
jest.setTimeout(10000);

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
    const goat = await ProductSearch.searchForProduct('goat cheese', storeId);
    expect(goat).toBeDefined();
    expect(goat.subcategory).toEqual('Goat Cheese');
  });
  test('gets shopping list id', async () => {
    const shoppingListId = await wegmans.getShoppingListId(tokens.access);
    expect(shoppingListId).toBeGreaterThan(0);
  });
  test('adds goat cheese to list', async () => {
    const goat = await ProductSearch.searchForProduct('goat cheese', storeId);
    await wegmans.addProductToShoppingList(tokens.access, goat);
  });
  test('gets purchase history', async () => {
    const history = await wegmans.getOrderHistory(tokens.access, storeId);
    // cache should have good stuff
    const orderedProducts = await orderHistoryDao.get(config.get('wegmans.email'));
    expect(orderedProducts.length).toBeGreaterThan(0);
    expect(history.length).toBeGreaterThan(0);
  });
  test('search products prefer history', async () => {
    const product = await ProductSearch.searchForProductPreferHistory(wegmans.getOrderHistory(tokens.access, storeId), 'Eggs', storeId);
    expect(product).toBeDefined();
  });
  //TODO: write a test that mocks fuse to return no products.  make sure product comes from actual wegmans search
  //TODO: write unit tests that mock wegmans
});