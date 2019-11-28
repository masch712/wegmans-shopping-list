import { cancelAllRequests } from "./CancellableRequestUtils";
import * as cancellableRequest from "./CancellableRequest.js";
import { logger, logDuration } from "./Logger";

const responsesReceived = [];
async function delay(ms) {
  try {
    const res = await cancellableRequest.get({
      url: `http://slowwly.robertomurray.co.uk/delay/${ms}/url/http://www.google.com`,
      followAllRedirects: true
    });
    responsesReceived.push(res);
    return res;
  } catch (e) {
    logger().warn(e);
  }
}

async function manyPromises(delayMillis) {
  const proms = [];
  for (let index = 0; index < 5; index++) {
    proms.push(logDuration("manyPromises awaiting " + index, delay(delayMillis)));
  }
  return await Promise.all(proms);
}

async function onePromise(delayMillis) {
  return await logDuration("onePromise awaiting", delay(delayMillis));
}

describe("CancellableRequest - many requests", () => {
  it("is cancelled when cancelAllRequests() is called", async () => {
    await Promise.race([manyPromises(100), onePromise(10)]);
    cancelAllRequests();
    expect(responsesReceived).toHaveLength(1);
  });
});
