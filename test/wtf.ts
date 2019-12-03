import AWS = require("aws-sdk");
import { config } from "../lib/config";
import _ = require("lodash");
import { accessCodeDao } from "../lib/AccessCodeDao";

const globalLog = require("global-request-logger");
globalLog.initialize();
let startTime: number;
let endTime: number;
globalLog.on("success", function(request: any, response: any) {
  // console.log("Request", request);
  // console.log("Response", response);
  endTime = new Date().valueOf();
  console.log("start" + startTime);
});
globalLog.on("error", function(request: any, response: any) {
  console.log("ERROR");
  // console.log("Request", request);
  // console.log("Response", response);
});

async function main() {
  await accessCodeDao.initTables();
  const allAccessTokens: string[] = [];
  const allTokens = await accessCodeDao.getAllAccessTokens();
  allAccessTokens.push(...allTokens.map(t => t.access));

  // Rotate through the tokens and get each one
  const limit = 10;
  let i = 0;
  const durations: number[] = [];
  while (i < limit) {
    const iTokenToGet = i % allAccessTokens.length;
    startTime = new Date().valueOf();
    await accessCodeDao.getTokensByAccess(allAccessTokens[iTokenToGet]);
    // const duration = new Date().valueOf() - startTime;
    const duration = endTime - startTime;

    durations.push(duration);
    console.log(duration);
    i++;
  }

  const averageDuration = _.mean(durations);
  console.log(averageDuration);
}

main();
