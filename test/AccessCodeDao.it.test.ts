import config from "../lib/config";
import {accessCodeDao} from "../lib/AccessCodeDao";

describe('login', () => {
  beforeAll(async () => {
    try{
    await accessCodeDao.dropTables();
    } catch (err) {
      console.warn(err);
    }
  });
  test('inits tables', async () => {
    await accessCodeDao.initTables();
  });

  test('puts', async() => {
    await accessCodeDao.put({
      access: '123',
      refresh: '456',
      user: '789',
    });
  })
});