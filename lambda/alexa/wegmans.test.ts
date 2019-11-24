jest.mock("../../lib/Logger");
import { addToShoppingList } from "./wegmans";
import * as Logging from "../../lib/Logger";
import { mock, instance } from "ts-mockito";
import winston = require("winston");
import { PassThrough } from "stream";

const mockWinstonLogger = mock(winston.Logger);
describe.skip("add to shopping list", () => {
  beforeEach(() => {
    ((Logging.logger as unknown) as jest.Mock<
      () => winston.LoggerInstance
    >).mockReturnValue(instance(mockWinstonLogger));
  });
  it("passes", () => {
    expect(1).toEqual(1);
  });
});
