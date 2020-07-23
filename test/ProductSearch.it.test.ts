import { ProductSearch } from "../lib/ProductSearch";
import { WegmansDao } from "../lib/WegmansDao";
import { AccessToken, getStoreIdFromTokens } from "../models/AccessToken";
import { config } from "../lib/config";
import { OrderedProduct } from "../models/OrderedProduct";
import { getStringyProduct } from "../models/Product";
import { BrowserLoginTokens } from "../models/BrowserLoginTokens";

jest.setTimeout(30000);
const wegmans = new WegmansDao(config.get("wegmans.apikey"));
let tokens: BrowserLoginTokens;
let storeId: number;
let orderHistory: {
  orderedProducts: OrderedProduct[];
  cacheUpdatePromise?: Promise<void>;
};
beforeAll(async () => {
  try {
    tokens = await wegmans.login(config.get("wegmans.email"), config.get("wegmans.password"));
    // storeId = getStoreIdFromTokens(tokens);
    expect(tokens).toBeDefined();
    // orderHistory = await wegmans.getOrderHistory(tokens.access, storeId);
  } catch (err) {
    //TODO: upgrade jest cuz this doesn't actually cause the tests to fail
    fail(err);
  }
});
// test("search products get olive oil", async () => {
//   const product = await ProductSearch.searchForProductPreferHistory(
//     orderHistory.orderedProducts,
//     "extra-virgin olive oil",
//     storeId
//   );
//   expect(product).toBeDefined();
//   expect(getStringyProduct(product!)).toMatch(/olive oil/i);
//   expect(getStringyProduct(product!)).toMatch(/extra virgin/i);
// });
// test("search products get raisin bran", async () => {
//   const product = await ProductSearch.searchForProductPreferHistory(
//     orderHistory.orderedProducts,
//     "raisin bran",
//     storeId
//   );
//   expect(product).toBeDefined();
//   expect(getStringyProduct(product!)).toMatch(/raisin bran/i);
// });
// test("search products get ice cream", async () => {
//   const product = await ProductSearch.searchForProductPreferHistory(orderHistory.orderedProducts, "ice cream", storeId);
//   expect(product).toBeDefined();
//   expect(getStringyProduct(product!)).toMatch(/ice cream/i);
// });
// test("search products get organic whole wheat flour", async () => {
//   const product = await ProductSearch.searchForProductPreferHistory(
//     orderHistory.orderedProducts,
//     "organic whole wheat flour",
//     storeId
//   );
//   expect(product).toBeDefined();
//   expect(getStringyProduct(product!)).toMatch(/flour, whole wheat/i);
// });
// test("search products get pecorino romano", async () => {
//   const product = await ProductSearch.searchForProductPreferHistory(
//     orderHistory.orderedProducts,
//     "pecorino romano",
//     storeId
//   );
//   expect(product).toBeDefined();
//   expect(getStringyProduct(product!)).toMatch(/Pecorino Romano/i);
// });
// test("search products get raisins", async () => {
//   const product = await ProductSearch.searchForProductPreferHistory(orderHistory.orderedProducts, "raisins", storeId);
//   expect(product).toBeDefined();
//   expect(product!.name).toMatch(/raisins/i);
// });
