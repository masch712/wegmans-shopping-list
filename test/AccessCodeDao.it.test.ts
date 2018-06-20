import config from "../lib/config";
import { accessCodeDao, TABLENAME_TOKENSBYCODE } from "../lib/AccessCodeDao";
jest.setTimeout(30000);

describe('login', () => {
  beforeEach(async () => {
    try {
      await accessCodeDao.dropTables();
    } catch (err) {
      // console.warn(err);
    }
    await accessCodeDao.initTables();
  });

  test.only('tableexists', async () => {
    const result = await accessCodeDao.tableExists(TABLENAME_TOKENSBYCODE);
    expect(result).toBeTruthy();
  });

  test('puts and gets token with code', async () => {
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

  test('puts and gets token', async () => {
    const token = {
      access: '123',
      refresh: '456',
      user: '789',
    };

    await accessCodeDao.put(token);

    const byRefresh = await accessCodeDao.getTokensByRefresh(token.refresh);
    expect(byRefresh).toEqual(token);
  });


});