import { cancellableRequest, cancelAllRequests } from "./lib/CancellableRequest";
import { logger, logDuration } from "./lib/Logger";

async function delay(ms: number) {
  try {
    const res = await cancellableRequest({
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
  return proms;
}

async function onePromise() {
  const res = await logDuration("onePromise awaiting", delay(10));
}
//TODO: put this in an integration test

async function bigRace() {
  await Promise.race([manyPromises(), onePromise()]);
}
async function singleRace() {
  await Promise.race([onePromise()]);
}
async function single() {
  await onePromise();
}
async function main() {
  await logDuration("***bigRace", bigRace);
  await logDuration("***single", single);
  await logDuration("***singleRace", singleRace);
  //   cancelAllRequests();
  setTimeout(() => {
    logger().info("***Program finished");
  });
}

main();
