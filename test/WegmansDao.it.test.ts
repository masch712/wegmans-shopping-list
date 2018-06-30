import * as request from "request-promise-native";
import { config } from "../lib/config";
import {WegmansDao} from "../lib/WegmansDao";
import { AccessToken } from "../models/AccessToken";
jest.setTimeout(10000);
//Skip these normally; dont wanna spam wegmans
describe('wegmans dao', () => {
  const wegmans = new WegmansDao(config.get('wegmans.apikey'));
  let tokens: AccessToken;
  beforeAll(async () => {
    tokens = await wegmans.login(config.get('wegmans.email'), config.get('wegmans.password'));
    expect(tokens).toBeDefined();
  });
  test('gets goat cheese', async () => {
    const goat = await wegmans.searchForProduct('goat cheese');
    expect(goat).toBeDefined();
    expect(goat.subcategory).toEqual('Goat Cheese');
  });
  test('gets shopping list id', async () => {
    const shoppingListId = await wegmans.getShoppingListId(tokens.access);
    expect(shoppingListId).toBeGreaterThan(0);
  });
  test('adds goat cheese to list', async () => {
    const goat = await wegmans.searchForProduct('goat cheese');
    await wegmans.addProductToShoppingList(tokens.access, goat);
  });
  test('gets purchase history', async () => {
    const history = await wegmans.getOrderHistory(tokens.access);
    expect(history.length).toBeGreaterThan(0);
  });
  test.only('search products prefer history', async () => {
    const product = await wegmans.searchForProductPreferHistory(tokens.access, 'Eggs');
    expect(product).toBeDefined();
  });
});