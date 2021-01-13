import { handler } from "./order-history-updater";
import { WegmansDao } from "../../lib";
import { config } from "../../lib/config";
import {
  accessCodeDao,
  TABLENAME_TOKENSBYACCESS,
  TABLENAME_TOKENSBYCODE,
  TABLENAME_TOKENSBYREFRESH,
} from "../../lib/AccessCodeDao";
import { wrapWegmansTokens } from "../../models/AccessToken";
jest.setTimeout(60_000);
test("handler", async () => {
  const wegmansDao = new WegmansDao();
  const tokens = await wegmansDao.login(config.get("wegmans.email"), config.get("wegmans.password"));
  await accessCodeDao.dropTables([TABLENAME_TOKENSBYACCESS, TABLENAME_TOKENSBYCODE, TABLENAME_TOKENSBYREFRESH]);
  await accessCodeDao.initTables();
  process.env.FORCE_REFRESH = "1";
  await accessCodeDao.put(wrapWegmansTokens(tokens, config.get("jwtSecret")));
  await handler();
});
