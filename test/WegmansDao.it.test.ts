import * as request from "request-promise-native";
import config from "../lib/config";
import {WegmansDao} from "../lib/WegmansDao";

describe('login', () => {
  const wegmans = new WegmansDao();
  test('sets authtoken', async () => {
    await wegmans.login(config.get('wegmans.email'), config.get('wegmans.password'));
    expect(wegmans.getAuthToken()).toBeDefined();
  });
  test('gets goat cheese', async () => {
    const goat = await wegmans.searchForProduct('goat cheese');
    expect(goat).toBeDefined();
    expect(goat.subcategory).toEqual('Goat Cheese');
  });
  test('adds goat cheese to list', async () => {
    const goat = await wegmans.searchForProduct('goat cheese');
    await wegmans.addProductToShoppingList(goat);
  })
});