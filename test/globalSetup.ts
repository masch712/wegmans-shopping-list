process.env.LOGICAL_ENV = "local";

import { accessCodeDao } from "../lib/AccessCodeDao";

module.exports = async () => {
  await accessCodeDao.initTables();
};
