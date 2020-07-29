import { accessCodeDao } from "./AccessCodeDao";

describe("tableExists", () => {
  test("doesnt die", async () => {
    const hax = await accessCodeDao.tableExists("wtf");
    expect(hax).toBeFalsy();
  });
});

describe("initTables", () => {
  test("creates some tables", async () => {
    await accessCodeDao.initTables();
    const hax = await accessCodeDao.tableExists(accessCodeDao.tableParams[0].TableName);
    expect(hax).toBeTruthy();
  });
});
