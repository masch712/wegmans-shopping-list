import { AccessToken, getMostRecentlyIssuedToken } from "./AccessToken";
import { sign, JsonWebTokenError } from "jsonwebtoken";

describe('getMostRecentlyIssuedToken', () => {
  const secret = 'wtf';
  const tokens: AccessToken[] = [
    {
      access: sign({ iat: new Date().valueOf() }, secret),
      refresh: 'refresh1',
      user: 'user1'
    },
    {
      access: sign({ iat: new Date().valueOf() }, secret),
      refresh: 'refresh2',
      user: 'user1'
    },
    {
      access: sign({ iat: new Date().valueOf() }, secret),
      refresh: 'refresh3',
      user: 'user1'
    }
  ];

  it('returns the most recently issued token', () => {
    const actual = getMostRecentlyIssuedToken(tokens.reverse());
    const expected = tokens[0];

    expect(actual).toEqual(expected);
  });
});