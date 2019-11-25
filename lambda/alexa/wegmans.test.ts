// jest.mock("../../lib/Logger");
import { addToShoppingList, handleAddtoShoppingList } from "./wegmans";
import * as Logging from "../../lib/Logger";
import { mock, instance, when, anyString, anything, verify } from "ts-mockito";
import winston = require("winston");
import { PassThrough } from "stream";
import { WegmansService } from "../../lib/WegmansService";
import { WegmansDao } from "../../lib";
import { ResponseBuilder } from "ask-sdk-core";
import { Session, User, Response } from "ask-sdk-model";
import { AccessCodeDao } from "../../lib/AccessCodeDao";
import { tokenFactory, productFactory } from "../../test/TestDataFactory";

const mockWinstonLogger = mock(winston.Logger);
const mockWegmansService = mock(WegmansService);
const mockWegmansDao = mock(WegmansDao);
const mockAccessCodeDao = mock(AccessCodeDao);

const mockResponseBuilder = mock<ResponseBuilder>();
const mockSession = mock<Session>();
const mockUser = mock<User>();
const mockResponse = mock<Response>();

describe("add to shopping list", () => {
  beforeEach(() => {
    // const fakeLogger = instance(mockWinstonLogger);
    // ((Logging.logger as unknown) as jest.Mock<() => winston.LoggerInstance>).mockImplementation(() => fakeLogger);
  });
  describe("Given a product is found", () => {
    it("adds to shopping list via queue", async () => {
      const fakeResponseBuilder = instance(mockResponseBuilder);
      const fakeResponse = instance(mockResponse);
      const fakeTokens = tokenFactory.build();
      const fakeProduct = productFactory.build({ name: "raisins" });

      when(mockSession.user).thenReturn(instance(mockUser));
      when(mockUser.accessToken).thenReturn(fakeTokens.access);

      when(mockResponseBuilder.speak(anyString())).thenReturn(fakeResponseBuilder);
      when(mockResponseBuilder.getResponse()).thenReturn(fakeResponse);

      when(mockWegmansService.getTokensFromAccess(fakeTokens.access)).thenResolve(fakeTokens);
      when(mockWegmansService.searchForProduct("raisins", fakeTokens)).thenResolve(fakeProduct);
      // when(mockWegmansDao.enqueue_addProductToShoppingList(fakeTokens.access, fakeProduct, anything())).thenResolve();

      // TODO: don't reach inco Session and ResponesBuilder?  make this function alexa-agnostic?  law of demeter / Tell-don't-ask?
      await handleAddtoShoppingList(
        instance(mockWegmansService),
        "raisins",
        instance(mockSession),
        instance(mockResponseBuilder)
      );

      verify(mockWegmansDao.enqueue_addProductToShoppingList(fakeTokens.access, fakeProduct, 1)).once();
    });
  });
});
