process.env.LOGICAL_ENV = "local";

import { orderHistoryDao } from "../lib/OrderHistoryDao";
import { accessCodeDao } from "../lib/AccessCodeDao";

module.exports = async () => {
  await orderHistoryDao.initTables();
  await accessCodeDao.initTables();
};
