jest.mock("../../lib/Logger");
import { addToShoppingList } from "./wegmans";
import * as Logging from "../../lib/Logger";
import { mock, instance } from "ts-mockito";
import winston = require("winston");
import { PassThrough } from "stream";
import { WegmansService } from "../../lib/WegmansService";
import { WegmansDao } from "../../lib";

const mockWinstonLogger = mock(winston.Logger);
const mockWegmansService = mock(WegmansService);
const mockWegmansDao = mock(WegmansDao);

describe.skip("add to shopping list", () => {
  beforeEach(() => {
    ((Logging.logger as unknown) as jest.Mock<() => winston.LoggerInstance>).mockReturnValue(
      instance(mockWinstonLogger)
    );
  });
  describe("Given a product is found", () => {
    it("adds to shopping list", async () => {});
  });
});
