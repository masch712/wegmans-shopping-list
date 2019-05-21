import { productRequestHistoryDao } from "../lib/ProductRequestHistoryDao";
import * as _ from "lodash";
jest.setTimeout(3000000);

/***************************************************************
 * NOTE: IF YOU'RE SEEING TIMEOUTS, MAKE SURE YOU HAVE ALOCAL
 * DYNAMODB RUNNING
 * *************************************************************
 */
const TEST_USERID = 'FAKE_USERNAME_FOR_TESTING@FAKE.COM';
//Skip these normally; dont wanna spam wegmans
describe('ProductRequestHistoryDAO', () => {
  const testProduct = { brand: '', category: 'fiver', department: 'johnson', details: 'echo', name: 'fdsa', productLine: 'qwre', sku: 4321, subcategory: 'hmm' };
  test('puts request history', async () => {
    await productRequestHistoryDao.put(TEST_USERID, "derp", testProduct);
  });
  test('gets purchase history', async () => {
    const result = await productRequestHistoryDao.get(TEST_USERID, "derp");
    expect(result).toBeDefined();
    expect(result!.chosenProduct).toEqual(testProduct);
  });
});