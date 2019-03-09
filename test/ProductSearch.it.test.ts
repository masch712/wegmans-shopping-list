import { ProductSearch } from "../lib/ProductSearch";
import { WegmansDao } from "../lib/WegmansDao";
import { AccessToken } from "../models/AccessToken";
import { config } from "../lib/config";
import { OrderedProduct } from "../models/OrderedProduct";

jest.setTimeout(30000);
const wegmans = new WegmansDao(config.get('wegmans.apikey'));
let tokens: AccessToken;
let storeId: number;
let orderHistory: {
  orderedProducts: OrderedProduct[];
  cacheUpdatePromise?: Promise<void>;
};
beforeAll(async () => {
  tokens = await wegmans.login(config.get('wegmans.email'), config.get('wegmans.password'));
  storeId = WegmansDao.getStoreIdFromTokens(tokens);
  expect(tokens).toBeDefined();
  orderHistory = await wegmans.getOrderHistory(tokens.access, storeId);
});

test('search products get olive oil', async () => {
  const product = await ProductSearch.searchForProductPreferHistory(orderHistory.orderedProducts, 'extra-virgin olive oil', storeId);
  expect(product).toBeDefined();
  expect(product!.name).toMatch(/olive oil/i);
});
test('search products get raisin bran', async () => {
  const product = await ProductSearch.searchForProductPreferHistory(orderHistory.orderedProducts, 'raisin bran', storeId);
  expect(product).toBeDefined();
  expect(product!.productLine).toMatch(/raisin bran/i);
});
test('search products get ice cream', async () => {
  const product = await ProductSearch.searchForProductPreferHistory(orderHistory.orderedProducts, 'ice cream', storeId);
  expect(product).toBeDefined();
  expect(product!.category).toMatch(/ice cream/i);
});
test('search products get organic whole wheat flour', async () => {
  const product = await ProductSearch.searchForProductPreferHistory(orderHistory.orderedProducts, 'organic whole wheat flour', storeId);
  expect(product).toBeDefined();
  expect(product!.name).toMatch(/flour, whole wheat/i);
});
test('search products get pecorino romano', async () => {
  const product = await ProductSearch.searchForProductPreferHistory(orderHistory.orderedProducts, 'pecorino romano', storeId);
  expect(product).toBeDefined();
  expect(product!.name).toMatch(/Pecorino Romano/i);
});
