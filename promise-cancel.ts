import { cancellableRequest, cancelAllRequests } from "./lib/CancellableRequest";
import { logger, logDuration } from "./lib/Logger";

async function delay(ms: number) {
  try {
    await cancellableRequest(`http://slowwly.robertomurray.co.uk/delay/${ms}/url/http://www.google.com`);
    logger().debug("*RESPONDED " + ms);
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
  await logDuration("onePromise awaiting", delay(10));
}
//TODO: put this in an integration test
async function main() {
  await Promise.race([manyPromises(), onePromise()]);
  logger().info("**Race finished");
  cancelAllRequests();
  setTimeout(() => {
    logger().info("***Program finished");
  });
}

main();
