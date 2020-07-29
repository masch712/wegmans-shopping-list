import { logger } from "../lib/Logger";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { config } from "../lib/config";
import { BrowserLoginTokens } from "./BrowserLoginTokens";
import { decode } from "punycode";
import { Cookie } from "tough-cookie";

export interface WedgiesOAuthToken {
  access: string;
  refresh: string;
  authorization_code?: string;
}

export interface PreRefreshedAccessToken extends WedgiesOAuthToken {
  refreshed_by: string;
}

export interface DecodedAccessToken {
  exp: Date;
  iat: Date;
  sub: string;
}

export interface WrappedWegmansTokens extends BrowserLoginTokens {
  iss: string;
  exp: number;
  iat: number;
  sub: string;
}

export function wrapWegmansTokens(wegmansTokens: BrowserLoginTokens, jwtSecret: string): WedgiesOAuthToken {
  const nowEpochSecs = Math.floor(new Date().getTime() / 1000);
  const expiryEpochSecs = (Cookie.parse(wegmansTokens.cookies["session-prd-weg"])?.expiryTime() || 0) / 1000;
  // tslint:disable-next-line:variable-name
  logger().debug("expiryEpochSecs: " + expiryEpochSecs);
  logger().debug("nowEpochSecs: " + nowEpochSecs);

  return {
    access: jwt.sign(
      //TODO: make a type outta this and use it in getExpiresInSecondsFromAccessToken
      {
        exp: expiryEpochSecs,
        iat: nowEpochSecs,
        iss: "wedgies",
        sub: getUserIdFromWegmansToken(wegmansTokens),
        ...wegmansTokens,
      },
      jwtSecret
    ),
    refresh: jwt.sign(
      {
        ...wegmansTokens,
      },
      jwtSecret
    ),
  };
}

export function secondsTilExpiry(accessToken: string) {
  const { exp, iat } = jwt.decode(accessToken) as any;
  return exp - iat;
}

export function unwrapWedgiesToken(wrappedJwt: string, secret: string): BrowserLoginTokens {
  let decodedWrappedToken: WrappedWegmansTokens | null = null;

  try {
    if (config.get("jwtInsecure")) {
      decodedWrappedToken = jwt.decode(wrappedJwt) as WrappedWegmansTokens;
    } else {
      decodedWrappedToken = jwt.verify(wrappedJwt, secret) as WrappedWegmansTokens;
    }
  } catch (err) {
    logger().error(err.message);
    //TODO: do i need this shit??
    /*if (err.message === "invalid signature" || err.message === "jwt malformed") {
      // If we try to unwrap a wegmans access token (valid JWT but signed by wegmans, not wedgies), we get 'invalid signature';
      // if we try to unwrap a refresh token (not a valid jwt) we get 'jwt malformed'
      // Either way, return null and let the requestor move on.
      //TODO: write contract tests against jsonwebtoken library asserting these error messages are accurate
    } else*/
    if (err.message === "jwt expired") {
      // We don't care if it's expired here; let downstream function deal with that.
      decodedWrappedToken = jwt.decode(wrappedJwt) as WrappedWegmansTokens;
    } else {
      throw err;
    }
  }

  return {
    cookies: decodedWrappedToken?.cookies,
    session_token: decodedWrappedToken?.session_token,
  };
}

export function decodeAccess(accessToken: string): DecodedAccessToken {
  const decoded = jwt.decode(accessToken)! as any;
  return {
    exp: new Date(decoded.exp * 1000),
    iat: new Date(decoded.iat * 1000),
    sub: decoded.sub,
  };
}

export function getMostRecentlyIssuedToken(tokens: WedgiesOAuthToken[]) {
  const sortedTokensForUser = _.sortBy(
    tokens,
    (token: WedgiesOAuthToken) => decodeAccess(token.access).iat.valueOf() * -1
  );

  return sortedTokensForUser[0];
}

export function getStoreIdFromuserToken(userFromJwt: string) {
  const decoded = jwt.decode(userFromJwt) as { [key: string]: any };
  const storeId = decoded.wfm_profile_store;
  return Number.parseInt(storeId, 10);
}

export function getTokenInfo(token: WedgiesOAuthToken) {
  const accessToken = jwt.decode(token.access) as { [key: string]: number }; // TODO: make a real JWT type?
  return {
    // TODO: are these dates still right?
    expiration: new Date(accessToken.exp * 1000),
    issued: new Date(accessToken.iat * 1000),
  };
}

export function isAccessTokenExpired(token: WedgiesOAuthToken): boolean {
  return getTokenInfo(token).expiration.valueOf() < new Date().valueOf();
}

export function getUserIdFromToken(token: WedgiesOAuthToken) {
  return (jwt.decode(token.access) as any).sub;
}

export function getUserIdFromWegmansToken(token: BrowserLoginTokens) {
  return (jwt.decode(token.session_token) as any).user_id;
}
