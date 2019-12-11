import { logger } from "../lib/Logger";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { config } from "../lib/config";

export interface AccessToken {
  access: string;
  refresh: string;
  user: string;
  access_code?: string;
}

export interface PreRefreshedAccessToken extends AccessToken {
  refreshed_by: string;
}

export interface DecodedAccessToken {
  exp: Date;
  iat: Date;
  sub: string;
}

export interface WrappedWegmansTokens {
  iss: string;
  exp: number;
  iat: number;
  sub: string;
  _access: string;
  _user: string;
  _refresh: string;
}

export function wrapWegmansTokens(token: AccessToken, secret: string) {
  const decodedWegmansAccessToken = decodeAccess(token.access);
  const wrappedToken: WrappedWegmansTokens = {
    ...decodedWegmansAccessToken,
    exp: config.get("jwtOverrideExpiresInSeconds") || decodedWegmansAccessToken.exp.valueOf() / 1000,
    iat: decodedWegmansAccessToken.iat.valueOf() / 1000,
    iss: "wedgies",
    sub: getUsernameFromToken(token),
    _access: token.access,
    _user: token.user,
    _refresh: token.refresh
  };

  return jwt.sign(JSON.stringify(wrappedToken), secret);
}

export function unwrapWegmansTokens(wrappedJwt: string, secret: string): AccessToken | null {
  // For backwards compatibility, in case wrappedJwt is just the accessToken itself, return null.
  // TODO: delete this once everyone's wegmans tokens are refreshed with wedgies tokens
  let wegmansTokens: AccessToken | null = null;
  let decodedWrappedToken: WrappedWegmansTokens | null = null;

  try {
    decodedWrappedToken = jwt.verify(wrappedJwt, secret) as WrappedWegmansTokens;
  } catch (err) {
    logger().error(err.message);
    if (err.message === "invalid signature" || err.message === "jwt malformed") {
      // If we try to unwrap a wegmans access token (valid JWT but signed by wegmans, not wedgies), we get 'invalid signature';
      // if we try to unwrap a refresh token (not a valid jwt) we get 'jwt malformed'
      // Either way, return null and let the requestor move on.
      //TODO: write contract tests against jsonwebtoken library asserting these error messages are accurate
    } else if (err.message === "jwt expired") {
      // We don't care if it's expired here; let downstream function deal with that.
      decodedWrappedToken = jwt.decode(wrappedJwt) as WrappedWegmansTokens;
    } else {
      throw err;
    }
  }

  wegmansTokens = decodedWrappedToken && {
    access: decodedWrappedToken._access,
    refresh: decodedWrappedToken._refresh,
    user: decodedWrappedToken._user
  };
  return wegmansTokens;
}

export function decodeAccess(accessToken: string): DecodedAccessToken {
  const decoded = jwt.decode(accessToken)! as any;
  return {
    exp: new Date(decoded.exp * 1000),
    iat: new Date(decoded.iat * 1000),
    sub: decoded.sub
  };
}

export function getMostRecentlyIssuedToken(tokens: AccessToken[]) {
  const sortedTokensForUser = _.sortBy(tokens, (token: AccessToken) => decodeAccess(token.access).iat.valueOf() * -1);

  return sortedTokensForUser[0];
}

export function getStoreIdFromuserToken(userFromJwt: string) {
  const decoded = jwt.decode(userFromJwt) as { [key: string]: any };
  const storeId = decoded.wfm_profile_store;
  return Number.parseInt(storeId, 10);
}

export function getTokenInfo(token: AccessToken) {
  const accessToken = jwt.decode(token.access) as { [key: string]: number }; // TODO: make a real JWT type?
  return {
    expiration: new Date(accessToken.exp * 1000),
    issued: new Date(accessToken.iat * 1000)
  };
}

export function isAccessTokenExpired(token: AccessToken): boolean {
  return getTokenInfo(token).expiration.valueOf() < new Date().valueOf();
}

export function getUsernameFromToken(token: AccessToken) {
  return (jwt.decode(token.access) as any).sub;
}

export function getStoreIdFromTokens(token: AccessToken): number {
  const userToken = jwt.decode(token.user) as { [key: string]: number }; // TODO: make a real JWT type?
  const storeId = userToken!["wfm_profile_store"];
  return storeId;
}
