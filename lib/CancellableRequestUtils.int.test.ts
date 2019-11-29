import * as cancellableRequest from "./CancellableRequest";
import { cancelAllRequests } from "./CancelAllRequestsUtils";

async function delay(ms: number, responseRepo: any[]) {
  const res = await cancellableRequest.get({
    url: `http://slowwly.robertomurray.co.uk/delay/${ms}/url/http://www.google.com`,
    followAllRedirects: true
  });
  responseRepo.push(res);
  return res;
}

describe("CancellableRequest - many requests", () => {
  it("is cancelled when cancelAllRequests() is called", async () => {
    const responsesReceived: any[] = [];
    const fast = delay(10, responsesReceived);
    const slow = delay(10000, responsesReceived);
    const startTime = new Date().valueOf();

    await Promise.race([slow, fast]);
    cancelAllRequests();

    await fast;
    await expect(slow).rejects.toThrow();
    expect(responsesReceived).toHaveLength(1);
    expect(new Date().valueOf() - startTime).toBeLessThan(10000);
  });
});
