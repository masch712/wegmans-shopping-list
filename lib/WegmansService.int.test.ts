import { WedgiesOAuthDao, accessCodeDao } from "./AccessCodeDao";
import { WegmansService } from "./WegmansService";
import { WegmansDao } from "./WegmansDao";
import { config } from "./config";
import { logger } from "./Logger";

jest.setTimeout(1000 * 60 * 10);
describe("handleAddToShoppingList", () => {
  test("fresh tokens", async () => {
    const wegmansDao = new WegmansDao("blah");
    const wegmansService = new WegmansService(wegmansDao, accessCodeDao);

    const tokens = await wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));
    const msg = await wegmansService.handleAddtoShoppingList("oatmeal", tokens, 30_000);

    expect(msg).toBeTruthy();
  });
});
