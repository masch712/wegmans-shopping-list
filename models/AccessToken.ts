import { decode } from "jsonwebtoken";

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