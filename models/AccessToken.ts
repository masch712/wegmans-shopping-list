import { decode } from "jsonwebtoken";

import { logger } from "../lib/Logger";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";

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

export function decodeAccess(accessToken: string): DecodedAccessToken {
  const decoded = decode(accessToken)! as any;
  return {
    exp: new Date(decoded.exp * 1000),
    iat: new Date(decoded.iat * 1000),
    sub: decoded.sub
  };
}

export function getMostRecentlyIssuedToken(tokens: AccessToken[]) {
  const sortedTokensForUser = _.sortBy(
    tokens,
    (token: AccessToken) => decodeAccess(token.access).iat.valueOf() * -1
  );

  return sortedTokensForUser[0];
}

export function getStoreIdFromuserToken(userFromJwt: string) {
  const decoded = decode(userFromJwt) as { [key: string]: any };
  const storeId = decoded.wfm_profile_store;
  return Number.parseInt(storeId, 10);
}

export function getTokenInfo(token: AccessToken) {
  const accessToken = jwt.decode(token.access) as { [key: string]: number }; // TODO: make a real JWT type?
  return {
    expiration: new Date(accessToken.exp * 1000),
    issued: new Date(accessToken.iss * 1000)
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
