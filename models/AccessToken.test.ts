import { WedgiesOAuthToken, getMostRecentlyIssuedToken, unwrapWedgiesToken, wrapWegmansTokens } from "./AccessToken";
import { sign, JsonWebTokenError } from "jsonwebtoken";
import { tokenFactory } from "../test/TestDataFactory";

describe("getMostRecentlyIssuedToken", () => {
  const secret = "wtf";
  const tokens: WedgiesOAuthToken[] = [
    {
      access: sign({ iat: new Date().valueOf() }, secret),
      refresh: "refresh1",
    },
    {
      access: sign({ iat: new Date().valueOf() }, secret),
      refresh: "refresh2",
    },
    {
      access: sign({ iat: new Date().valueOf() }, secret),
      refresh: "refresh3",
    },
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
    const unwrappedTokens = unwrapWedgiesToken(wrappedTokens.access, secret);
    expect(unwrappedTokens).toEqual(fakeToken);
  });
  //TODO: mock jwsInsecure config for this test
  // expect(() => {
  //   const foreignToken = sign(JSON.stringify(fakeToken), secret + "___something more");

  //   unwrapWedgiesToken(foreignToken, secret);
  // }).toThrow();
  // });
});
