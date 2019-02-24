import * as request from "request-promise-native";
import { config } from "../lib/config";
import { orderHistoryDao } from "../lib/OrderHistoryDao";
import { AccessToken } from "../models/AccessToken";
import { ProductSearch } from "../lib/ProductSearch";
import * as _ from "lodash";
jest.setTimeout(3000000);

/***************************************************************
 * NOTE: IF YOU'RE SEEING TIMEOUTS, MAKE SURE YOU HAVE ALOCAL
 * DYNAMODB RUNNING
 * *************************************************************
 */
const TEST_USERID = 'FAKE_USERNAME_FOR_TESTING@FAKE.COM';
//Skip these normally; dont wanna spam wegmans
describe('OrderHistoryDAO', () => {
  test('puts purchase history', async () => {
    const testProduct = { product: { brand: '', category: 'fiver', department: 'johnson', details: 'echo', name: 'fdsa', productLine: 'qwre', sku: 4321, subcategory: 'hmm' }, purchaseMsSinceEpoch: 4321, quantity: 1, sku: 4321 };
    await orderHistoryDao.put(TEST_USERID, [testProduct]);
    const bigProductArray = new Array(1000);
    _.fill(bigProductArray, testProduct);
    await orderHistoryDao.put(TEST_USERID, bigProductArray);
  });
  test('gets purchase history', async () => {
    await orderHistoryDao.get(TEST_USERID);
  });
  //TODO: write a test that mocks fuse to return no products.  make sure product comes from actual wegmans search
  //TODO: write unit tests that mock wegmans
});