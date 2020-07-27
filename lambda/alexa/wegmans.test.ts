// jest.mock("../../lib/Logger");
import { mock, when, verify, deepEqual, instance, spy, anyString } from "ts-mockito";
import { WegmansService } from "../../lib/WegmansService";
import { ResponseBuilder } from "ask-sdk-core";
import { Response } from "ask-sdk-model";
import { tokenFactory, productFactory } from "../../test/TestDataFactory";
import { WegmansDao } from "../../lib";
import { WedgiesOAuthDao } from "../../lib/AccessCodeDao";
import { wrapWegmansTokens } from "../../models/AccessToken";

const mockWegmansDao = mock(WegmansDao);
const mockAccessCodeDao = mock(WedgiesOAuthDao);

describe("Given a product is found", () => {
  it("adds to shopping list via queue", async () => {
    const fakeWegmansTokens = tokenFactory.build();
    const fakeProduct = productFactory.build({ name: "raisins" });

    const fakeWegmansDao = instance(mockWegmansDao);
    const fakeAccessCodeDao = instance(mockAccessCodeDao);
    const wegmansService = new WegmansService(fakeWegmansDao, fakeAccessCodeDao, Promise.resolve("tz"));
    const spiedWegmansService = spy(wegmansService);

    const fakeWedgiesTokens = wrapWegmansTokens(fakeWegmansTokens, "test");
    when(spiedWegmansService.getFreshTokensOrLogin(fakeWedgiesTokens)).thenResolve(fakeWedgiesTokens);
    when(spiedWegmansService.searchForProduct("raisins", fakeWegmansTokens)).thenResolve(fakeProduct);
    when(spiedWegmansService._getNoteForShoppingList("raisins", anyString())).thenReturn("some note");

    await wegmansService.handleAddtoShoppingList("raisins", fakeWegmansTokens);

    verify(spiedWegmansService.enqueue_putItemToCart(fakeWegmansTokens, fakeProduct, 1, "some note")).once();
  });
});
