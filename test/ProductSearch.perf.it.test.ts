import { ProductSearch } from "../lib/ProductSearch";
import { WegmansDao } from "../lib/WegmansDao";
import { AccessToken } from "../models/AccessToken";
import { config } from "../lib/config";
import { OrderedProduct } from "../models/OrderedProduct";
import * as _ from "lodash";

jest.setTimeout(60000);

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
});

describe('10 searches', async () => {
  const queries = ['grapefruit', 'ice cream', 'olive oil', 'cheerios', 'milk', 'yogurt', 'ground cinnamon', 'all-purpose flour', 'san pellegrino', 'scotch whiskey'];
  beforeAll(async () => {
    orderHistory = await wegmans.getOrderHistory(tokens.access, storeId);
  });
  const numTests = 3;
  for (const skuMax of _.rangeRight(1, numTests + 1)) {
    test(((100*skuMax)/numTests).toString() + ' of skus', async () => {
      const numSkus = skuMax * (orderHistory.orderedProducts.length / numTests);
      const trimmedOrderedProducts = _.slice(orderHistory.orderedProducts, 0, numSkus);
      const durations: number[] = [];
      for (const query of queries) {
        const startTime = new Date().getTime();
        await ProductSearch.wegmansSearchSkus(trimmedOrderedProducts.map(op => op.sku), query, storeId);
        const endTime = new Date().getTime();
        durations.push(endTime - startTime);
      }

      console.log(_.mean(durations));
    });
  }
});

