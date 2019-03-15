import { decode } from "jsonwebtoken";

import { logger } from "../lib/Logger";
import * as jwt from 'jsonwebtoken';

export interface AccessToken {
  access: string;
  refresh: string;
  user: string;
  access_code?: string;
}

export function getStoreIdFromuserToken(userFromJwt: string) {
  const decoded = decode(userFromJwt) as { [key: string]: any };
  const storeId = decoded.wfm_profile_store;
  return Number.parseInt(storeId);
}

export function isAccessTokenExpired(token: AccessToken): boolean {
  const accessToken = jwt.decode(token.access) as { [key: string]: number }; // TODO: make a real JWT type?
  const exp = accessToken.exp;
  return exp*1000 < new Date().valueOf();
}

export function getUsernameFromToken(token: AccessToken) {
  return (jwt.decode(token.access) as any).jwt;
}

export function getStoreIdFromTokens(token: AccessToken): number {
  const userToken = jwt.decode(token.user) as { [key: string]: number }; // TODO: make a real JWT type?
  const storeId = userToken!['wfa_profile_store'];
  return storeId;
}