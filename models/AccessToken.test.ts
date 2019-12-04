import { AccessToken, getMostRecentlyIssuedToken, unwrapWegmansTokens, wrapWegmansTokens } from "./AccessToken";
import { sign, JsonWebTokenError } from "jsonwebtoken";
import { tokenFactory } from "../test/TestDataFactory";

describe("getMostRecentlyIssuedToken", () => {
  const secret = "wtf";
  const tokens: AccessToken[] = [
    {
      access: sign({ iat: new Date().valueOf() }, secret),
      refresh: "refresh1",
      user: "user1"
    },
    {
      access: sign({ iat: new Date().valueOf() }, secret),
      refresh: "refresh2",
      user: "user1"
    },
    {
      access: sign({ iat: new Date().valueOf() }, secret),
      refresh: "refresh3",
      user: "user1"
    }
  ];

  it("returns the most recently issued token", () => {
    const actual = getMostRecentlyIssuedToken(tokens.reverse());
    const expected = tokens[0];

    expect(actual).toEqual(expected);
  });
});

describe("unwrapWegmansTokens", () => {
  const secret = "sec";
  const fakeToken = tokenFactory.build();
  it("unwraps properly signed tokens", () => {
    const wrappedTokens = wrapWegmansTokens(fakeToken, secret);
    const unwrappedTokens = unwrapWegmansTokens(wrappedTokens, secret);
    expect(unwrappedTokens).toEqual(fakeToken);
  });
  it("returns null for token signed by someone else", () => {
    const foreignToken = sign(JSON.stringify(fakeToken), secret + "___something more");
    const unwrappedTokens = unwrapWegmansTokens(foreignToken, secret);
    expect(unwrappedTokens).toBeNull();
  });
});
