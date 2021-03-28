import { productRequestHistoryDao } from "../lib/ProductRequestHistoryDao";
import * as _ from "lodash";
import { StoreProductItem } from "../models/StoreProductItem";
jest.setTimeout(3000000);

/***************************************************************
 * NOTE: IF YOU'RE SEEING TIMEOUTS, MAKE SURE YOU HAVE ALOCAL
 * DYNAMODB RUNNING
 * *************************************************************
 */
const TEST_USERID = "FAKE_USERNAME_FOR_TESTING@FAKE.COM";
//Skip these normally; dont wanna spam wegmans
describe("ProductRequestHistoryDAO", () => {
  const testProduct: StoreProductItem = {
    fulfillment_types: [],
    id: "niner",
    name: "fiver",
    product_rating: {
      average_rating: 100,
      user_count: 1,
    },
    reco_rating: 1,
    tags: [],
    base_price: 0.0,
    base_quantity: 1,
    display_uom: "ea",
  };
  test("puts request history", async () => {
    await productRequestHistoryDao.put(TEST_USERID, "derp", testProduct);
  });
  test("gets purchase history", async () => {
    const result = await productRequestHistoryDao.get(TEST_USERID, "derp");
    expect(result).toBeDefined();
    expect(result!.chosenProduct).toEqual(testProduct);
  });
});
