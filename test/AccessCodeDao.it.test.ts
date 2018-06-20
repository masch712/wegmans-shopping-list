import config from "../lib/config";
import { accessCodeDao } from "../lib/AccessCodeDao";

describe('login', () => {
  beforeEach(async () => {
    try {
      await accessCodeDao.dropTables();
    } catch (err) {
      console.warn(err);
    }
    await accessCodeDao.initTables();
  });

  test('puts and gets', async () => {
    const token = {
      access: '123',
      refresh: '456',
      user: '789',
    };

    const tokenWithCode = {
      access_code: 'niner',
      ...token,
    };

    await accessCodeDao.put(tokenWithCode);

    const byCode = await accessCodeDao.getTokensByCode('niner');
    expect(byCode).toEqual(tokenWithCode);

    const byRefresh = await accessCodeDao.getTokensByRefresh(token.refresh);
    expect(byRefresh).toEqual(tokenWithCode);
  });



});