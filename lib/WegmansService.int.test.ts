import { WedgiesOAuthDao, accessCodeDao } from "./AccessCodeDao";
import { WegmansService } from "./WegmansService";
import { WegmansDao } from "./WegmansDao";
import { config } from "./config";
import { logger } from "./Logger";
import { unwrapWedgiesToken } from "../models/AccessToken";

jest.setTimeout(1000 * 60 * 10);
describe("handleAddToShoppingList", () => {
  test("fresh tokens", async () => {
    const wegmansDao = new WegmansDao("blah");
    const wegmansService = new WegmansService(wegmansDao, accessCodeDao);

    const tokens = await wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));

    const msg1 = await wegmansService.handleAddtoShoppingList(
      "oatmeal",
      tokens,
      config.get("alexa.skill.productSearchShortCircuitMillis")
    );

    const msg2 = await wegmansService.handleAddtoShoppingList(
      "bananas",
      tokens,
      config.get("alexa.skill.productSearchShortCircuitMillis")
    );

    expect(msg1).toMatch(/Added .+ to/);
    expect(msg2).toMatch(/Added .+ to/);
  });
});
