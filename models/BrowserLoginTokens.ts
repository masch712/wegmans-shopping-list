import { Cookie } from "request";
import request = require("request");
import { FAKE_JWT_SECRET } from "../test/TestDataFactory";
import { decode } from "jsonwebtoken";

export interface BrowserLoginTokens {
  session_token: string;
  cookies: CookieStringByKey;
}

export type CookieStringByKey = {
  [name: string]: string;
};

export function toCookieJar(tokens: BrowserLoginTokens) {
  const cookieJar = request.jar();
  Object.values(tokens.cookies).forEach((c) => cookieJar.setCookie(c, "https://shop.wegmans.com"));
  return cookieJar;
}

export function wegmansTokenInfo(token: BrowserLoginTokens): any {
  return decode(token.session_token);
}
