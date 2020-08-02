import {} from "module";
import { WegmansDao } from "./WegmansDao";
import { WegmansService } from "./WegmansService";
import { accessCodeDao } from "./AccessCodeDao";
import { config } from "./config";
import { BrowserLoginTokens } from "../models/BrowserLoginTokens";
import { StoreProductItem } from "../models/StoreProductItem";
jest.setTimeout(30000);
describe("product search regression", () => {
  const tests = [
    // {
    //   query: "strawberries",
    //   expected: {
    //     name: /strawberries/i,
    //   },
    // },
    // {
    //   query: "olive oil",
    //   expected: {
    //     name: /olive oil, extra virgin/i,
    //   },
    // },
    // {
    //   query: "raisin bran",
    //   expected: {
    //     name: /raisin bran/i,
    //   },
    // },
    {
      query: "bananas",
      expected: {
        name: /banana/i,
      },
    },
    {
      query: "cara cara oranges",
      expected: {
        name: /oranges/i,
      },
    },
  ];

  const assertCorrectProduct = (t: any, product?: StoreProductItem) => {
    expect(product).toBeTruthy();
    if (t.expected.name) {
      expect(product?.name).toMatch(t.expected.name);
    }
  };

  const wegmansDao = new WegmansDao("");
  const wegmansService = new WegmansService(wegmansDao, accessCodeDao);

  let tokens: BrowserLoginTokens;
  beforeAll(async () => {
    tokens = await wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));
  });

  tests.forEach((t) =>
    test(t.query, async () => {
      const product = await wegmansService.searchForProduct(t.query, tokens);
      assertCorrectProduct(t, product);
    })
  );
});
