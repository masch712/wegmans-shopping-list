process.env.LOGICAL_ENV = "development";
import { config } from "./lib/config";

import { accessCodeDao } from "./lib/AccessCodeDao";

accessCodeDao.initTables();
