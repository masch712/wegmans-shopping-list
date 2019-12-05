import { mock, spy, when, anyString, verify } from "ts-mockito";
import { logger, logDuration } from "./Logger";
import { serializeError } from "serialize-error";

describe("logDuration", () => {
  it("logs resolved promise", async () => {
    const loggerSpy = spy(logger());
    const debugMsgs: any[] = [];
    when(loggerSpy.debug(anyString())).thenCall(msg => debugMsgs.push(JSON.parse(msg)));
    await logDuration("fakePromise", Promise.resolve("niner"));
    verify(loggerSpy.debug(anyString())).twice();
    expect(debugMsgs[0].type).toEqual("starting");
    expect(debugMsgs[1].type).toEqual("resolved");
  });
  it("returns promise resolution", async () => {
    const loggerSpy = spy(logger());
    const debugMsgs: any[] = [];
    when(loggerSpy.debug(anyString())).thenCall(msg => debugMsgs.push(JSON.parse(msg)));
    const resolution = await logDuration("fakePromise", Promise.resolve("niner"));
    expect(resolution).toEqual("niner");
  });
  it("logs rejected promise", async () => {
    const loggerSpy = spy(logger());
    const debugMsgs: any[] = [];
    when(loggerSpy.debug(anyString())).thenCall(msg => debugMsgs.push(JSON.parse(msg)));
    const fakeError = new Error("fiver");
    await expect(logDuration("fakePromise", Promise.reject(fakeError))).rejects.toEqual(fakeError);
    expect(debugMsgs[0].type).toEqual("starting");
    expect(debugMsgs[1].type).toEqual("rejected");
  });
});
