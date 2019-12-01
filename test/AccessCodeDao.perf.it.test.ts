import { config } from "../lib/config";
import _ = require("lodash");
import { accessCodeDao } from "../lib/AccessCodeDao";
jest.setTimeout(30000);

beforeAll(async () => {
  await accessCodeDao.initTables();
});

describe("getTokensByAccess", () => {
  const allAccessTokens: string[] = [];
  beforeAll(async () => {
    const allTokens = await accessCodeDao.getAllAccessTokens();
    allAccessTokens.push(...allTokens.map(t => t.access));
  });

  it("10 gets", async () => {
    // Rotate through the tokens and get each one
    const limit = 10;
    let i = 0;
    const durations: number[] = [];
    while (i < limit) {
      const iTokenToGet = i % allAccessTokens.length;
      const startTime = new Date().valueOf();
      await accessCodeDao.getTokensByAccess(allAccessTokens[iTokenToGet]);
      const duration = new Date().valueOf() - startTime;

      durations.push(duration);
      console.log(duration);
      i++;
    }

    const averageDuration = _.mean(durations);
    expect(averageDuration).toBeLessThan(250);
  });
});
