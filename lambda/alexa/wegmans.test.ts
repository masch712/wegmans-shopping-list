jest.mock("../../lib/Logger");
import { addToShoppingList, handleAddtoShoppingList } from "./wegmans";
import * as Logging from "../../lib/Logger";
import { mock, instance, when, anyString } from "ts-mockito";
import winston = require("winston");
import { PassThrough } from "stream";
import { WegmansService } from "../../lib/WegmansService";
import { WegmansDao } from "../../lib";
import { ResponseBuilder } from "ask-sdk-core";
import { Session, User, Response } from "ask-sdk-model";
import { AccessCodeDao } from "../../lib/AccessCodeDao";

const mockWinstonLogger = mock(winston.Logger);
const mockWegmansService = mock(WegmansService);
const mockWegmansDao = mock(WegmansDao);
const mockAccessCodeDao = mock(AccessCodeDao);

const mockResponseBuilder = mock<ResponseBuilder>();
const mockSession = mock<Session>();
const mockUser = mock<User>();
const mockResponse = mock<Response>();

describe.skip("add to shopping list", () => {
  beforeEach(() => {
    ((Logging.logger as unknown) as jest.Mock<() => winston.LoggerInstance>).mockReturnValue(
      instance(mockWinstonLogger)
    );
  });
  describe("Given a product is found", () => {
    it("adds to shopping list", async () => {
      const fakeResponseBuilder = instance(mockResponseBuilder);
      const fakeResponse = instance(mockResponse);
      const fakeTokens = {
        access: 'faketoken',
        refresh: 'fakerefresh',
        user: 'aasch',
      };

      when(mockSession.user).thenReturn(instance(mockUser));
      when(mockUser.accessToken).thenReturn(fakeTokens.access);

      when(mockResponseBuilder.speak(anyString())).thenReturn(fakeResponseBuilder);
      when(mockResponseBuilder.getResponse()).thenReturn(fakeResponse);

      when(mockAccessCodeDao.getTokensByAccess(fakeTokens.access)).thenResolve(fakeTokens);
      when(mockWegmansService.searchForProduct('raisins')

      handleAddtoShoppingList(
        instance(mockWegmansService),
        "raisins",
        instance(mockSession),
        instance(mockResponseBuilder)
      );
    });
  });
});
