import { ProductSearch } from "../lib/ProductSearch";
import { WegmansDao } from "../lib/WegmansDao";
import { AccessToken } from "../models/AccessToken";
import { config } from "../lib/config";

const wegmans = new WegmansDao(config.get('wegmans.apikey'));
let tokens: AccessToken;
let storeId: number;
beforeAll(async () => {
  tokens = await wegmans.login(config.get('wegmans.email'), config.get('wegmans.password'));
  storeId = WegmansDao.getStoreIdFromTokens(tokens);
  expect(tokens).toBeDefined();
});
test('search products prefer history', async () => {
  const product = await ProductSearch.searchForProductPreferHistory(wegmans.getOrderHistory(tokens.access, storeId), 'extra-virgin olive oil', storeId);
  expect(product).toBeDefined();
});