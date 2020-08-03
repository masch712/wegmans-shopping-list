import { handler } from "./order-history-updater";
import { WegmansDao } from "../../lib";
import { config } from "../../lib/config";
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { wrapWegmansTokens } from "../../models/AccessToken";

test("handler", async () => {
  const wegmansDao = new WegmansDao();
  const tokens = await wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));
  await accessCodeDao.initTables();
  await accessCodeDao.put(wrapWegmansTokens(tokens, config.get("jwtSecret")));
  await handler();
});
