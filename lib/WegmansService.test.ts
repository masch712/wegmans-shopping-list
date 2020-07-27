import { WegmansService } from "./WegmansService";
import { mock, instance, spy, when } from "ts-mockito";
import { WegmansDao } from "./WegmansDao";
import { WedgiesOAuthDao } from "./AccessCodeDao";
import { tokenFactory, productFactory } from "../test/TestDataFactory";
const mockWegmansDao = mock(WegmansDao);
const mockAccessCodeDao = mock(WedgiesOAuthDao);

describe("WegmansService.searchForProductWithTimeout", () => {
  it("shortcircuits when it times out", async () => {
    const wegmansService = new WegmansService(instance(mockWegmansDao), instance(mockAccessCodeDao));
    const fakeProductQuery = "raisins";
    const fakeTokens = tokenFactory.build();

    const timeout = 10;
    const searchTime = 100;

    const spiedWegmansService = spy(wegmansService);
    when(spiedWegmansService.searchForProduct(fakeProductQuery, fakeTokens)).thenCall(async () => {
      return new Promise((resolve, reject) => setTimeout(() => resolve(), searchTime));
    });

    const startTime = new Date().valueOf();
    const { product, didSearchTimeout } = await wegmansService.searchForProductWithTimeout(
      fakeProductQuery,
      fakeTokens,
      timeout
    );
    const duration = new Date().valueOf() - startTime;

    expect(didSearchTimeout).toBeTruthy();
    expect(product).toBeFalsy();
    expect(duration).toBeLessThan(searchTime);
  });

  it("returns found product if search is fast enough", async () => {
    const wegmansService = new WegmansService(instance(mockWegmansDao), instance(mockAccessCodeDao));
    const fakeProductQuery = "raisins";
    const fakeProduct = productFactory.build();
    const fakeTokens = tokenFactory.build();

    const spiedWegmansService = spy(wegmansService);
    const searchTime = 10;
    const timeout = 100;
    when(spiedWegmansService.searchForProduct(fakeProductQuery, fakeTokens)).thenCall(async () => {
      return new Promise((resolve, reject) => setTimeout(() => resolve(fakeProduct), searchTime));
    });

    const startTime = new Date().valueOf();
    const { product, didSearchTimeout } = await wegmansService.searchForProductWithTimeout(
      fakeProductQuery,
      fakeTokens,
      timeout
    );
    const duration = new Date().valueOf() - startTime;

    expect(didSearchTimeout).toBeFalsy();
    expect(product).toEqual(fakeProduct);
    expect(duration).toBeGreaterThanOrEqual(searchTime);
    expect(duration).toBeLessThan(timeout);
  });
});
