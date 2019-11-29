import { cancelAllRequests } from "./lib/CancelAllRequestsUtils";
import * as cancellableRequest from "./lib/CancellableRequest";
import { logger, logDuration } from "./lib/Logger";
import { config } from "./lib/config";

async function delay(ms: number) {
  try {
    const res = await cancellableRequest.get({
      url: `http://slowwly.robertomurray.co.uk/delay/${ms}/url/http://www.google.com`,
      followAllRedirects: true
    });
    logger().debug("*RESPONDED " + ms);
    return res;
  } catch (e) {
    logger().warn(e);
  }
}

async function manyPromises() {
  const proms = [];
  for (let index = 0; index < 5; index++) {
    proms.push(logDuration("manyPromises awaiting " + index, delay(1000)));
  }
  return await Promise.all(proms);
}

async function onePromise() {
  return await logDuration("onePromise awaiting", delay(500));
}
//TODO: put this in an integration test

async function bigRace() {
  return await Promise.race([manyPromises(), onePromise()]);
}
async function singleRace() {
  return await Promise.race([onePromise()]);
}
async function single() {
  return await onePromise();
}
async function main() {
  const res = await logDuration("***bigRace", bigRace);
  //   await logDuration("***single", single);
  //   await logDuration("***singleRace", singleRace);
  cancelAllRequests();
  setTimeout(() => {
    logger().info("***Program finished");
  });
}

main();
//TODO: WTF IS GOING ON
