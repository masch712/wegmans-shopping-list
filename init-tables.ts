process.env.LOGICAL_ENV = 'development';
import { config } from "./lib/config";

import { orderHistoryDao } from "./lib/OrderHistoryDao";
import { accessCodeDao } from "./lib/AccessCodeDao";

orderHistoryDao.initTables();
accessCodeDao.initTables();