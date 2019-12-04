// jest.mock("../../lib/Logger");
import { mock, when, verify, deepEqual, instance, spy, anyString } from "ts-mockito";
import { WegmansService } from "../../lib/WegmansService";
import { ResponseBuilder } from "ask-sdk-core";
import { Response } from "ask-sdk-model";
import { tokenFactory, productFactory } from "../../test/TestDataFactory";
import { WegmansDao } from "../../lib";
import { AccessCodeDao } from "../../lib/AccessCodeDao";

const mockWegmansDao = mock(WegmansDao);
const mockAccessCodeDao = mock(AccessCodeDao);

describe("Given a product is found", () => {
  it("adds to shopping list via queue", async () => {
    const fakeTokens = tokenFactory.build();
    const fakeProduct = productFactory.build({ name: "raisins" });

    const fakeWegmansDao = instance(mockWegmansDao);
    const fakeAccessCodeDao = instance(mockAccessCodeDao);
    const wegmansService = new WegmansService(fakeWegmansDao, fakeAccessCodeDao);
    const spiedWegmansService = spy(wegmansService);

    when(spiedWegmansService.getFreshTokensOrLogin(fakeTokens.access)).thenResolve(fakeTokens);
    when(spiedWegmansService.searchForProduct("raisins", fakeTokens)).thenResolve(fakeProduct);
    when(spiedWegmansService._getNoteForShoppingList("raisins")).thenReturn("some note");

    await wegmansService.handleAddtoShoppingList("raisins", fakeTokens);

    verify(spiedWegmansService.enqueue_addProductToShoppingList(fakeTokens.access, fakeProduct, 1, "some note")).once();
  });
});
