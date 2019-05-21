import { accessCodeDao  } from "../lib/AccessCodeDao";
import { decodeAccess } from "../models/AccessToken";
async function main() {
  const allTokens = await accessCodeDao.getAllAccessTokens();
  const allPreRefreshed = await Promise.all(allTokens.map(token => accessCodeDao.getPreRefreshedToken(token.refresh)));
  for (const preRefreshed of allPreRefreshed) {
    console.log(JSON.stringify(decodeAccess(preRefreshed.access)));
  }
}

main();
