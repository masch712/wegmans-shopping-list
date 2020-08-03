import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import * as basic from "basic-auth";
import { decode, sign } from "jsonwebtoken";
import * as querystring from "querystring";
import * as uuid from "uuid/v4";
import { accessCodeDao as wedgiesOAuthDao } from "../../lib/AccessCodeDao";
import { config } from "../../lib/config";
import { decryptionPromise } from "../../lib/decrypt-config";
import { logger, logDuration } from "../../lib/Logger";
import { WegmansDao } from "../../lib/WegmansDao";
import {
  WedgiesOAuthToken,
  isAccessTokenExpired,
  unwrapWedgiesToken as unwrapWedgiesTokens,
  wrapWegmansTokens,
  secondsTilExpiry,
} from "../../models/AccessToken";
import { BrowserLoginTokens } from "../../models/BrowserLoginTokens";
import request = require("request");

const wegmansDaoPromise = decryptionPromise.then(() => new WegmansDao());

/**
 * Accept request from the React Login UI containing username, password
 * Login to wegmans
 * Generate an authorization code, save it to the database with the given credentials.
 * Overwrite any code that's already in the db for the given user.
 * Respond with the code.
 */
export const generateAccessCode: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  // DO NOT LOG THE EVENT; it contains the password
  // logger().debug("Event received: " + JSON.stringify(event, null, 2));
  if (!event.body) {
    throw new Error("gotta have a body");
  }
  if (event.httpMethod === "OPTIONS") {
    return {
      body: "",
      headers: corsHeaders,
      statusCode: 200,
    };
  }

  const code = uuid();
  const body = JSON.parse(event.body);
  const jwtSecret = config.get("jwtSecret");
  const username = body.username;
  const password = body.password;
  const wegmansDao = await wegmansDaoPromise;
  logger().debug("Got wegmans DAO.  Logging in");

  let wegmansTokens: BrowserLoginTokens;

  // short-circuit for test user
  if (username === "test") {
    logger().debug("Test login found");
    wegmansTokens = {
      cookies: { "session-prd-weg": "session-prd-weg" + uuid() },
      session_token: "session_token" + uuid(),
    };
  } else {
    wegmansTokens = await wegmansDao.login(username, password);
  }
  logger().debug(JSON.stringify({ wegmansTokens }));
  const wedgiesTokens = wrapWegmansTokens(wegmansTokens, jwtSecret);

  logger().debug("Login resolved");

  await wedgiesOAuthDao.initTables();

  logger().debug("Putting wedgiesTokens to db");
  await wedgiesOAuthDao.put({
    ...wedgiesTokens,
    authorization_code: code,
  });

  return {
    body: JSON.stringify({
      code,
    }),
    headers: corsHeaders,
    statusCode: 200,
  };
};

export const getTokens: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === "OPTIONS") {
    return {
      body: "",
      headers: corsHeaders,
      statusCode: 200,
    };
  }

  const authHeader = event.headers.Authorization;
  if (!authHeader) {
    throw new Error("No Authorization header found");
  }
  if (!event.body) {
    throw new Error("gotta have a body");
  }
  await decryptionPromise;
  // TODO: figure out wtf is goin on with this error: 2020-07-26T22:31:53.036Z	1ea43d14-cf65-45ec-8649-2472a82d91d1	ERROR	Invoke Error	{"errorType":"Error","errorMessage":"No access token found for given code","stack":["Error: No access token found for given code"," at Runtime.exports.getTokens [as handler] (/var/task/dist/lambda/server/auth-server.js:143:15)"," at process._tickCallback (internal/process/next_tick.js:68:7)"]}

  const parsedAuth = basic.parse(authHeader)!;
  if (parsedAuth.name !== config.get("alexa.skill.name") || parsedAuth.pass !== config.get("alexa.skill.secret")) {
    throw new Error("Alexa credentials invalid");
  }

  logger().debug("creds are good!");

  const body = querystring.parse(event.body);
  logger().debug("getting tokens");
  let freshWedgiesTokens: WedgiesOAuthToken | null = null;
  let deletePromise;
  const jwtSecret = config.get("jwtSecret");

  // If Alexa is sending us an authorization_code and waants tokens, that means we're finishing up account linking.
  // Get the tokens and delete the authorization_code; don't need it again.
  // https://developer.amazon.com/docs/account-linking/configure-authorization-code-grant.html
  if (body.code) {
    logger().debug("getting token by authorization_code");
    freshWedgiesTokens = await wedgiesOAuthDao.getTokensByCode(body.code as string);

    logger().debug("deleting authorization_code");
    deletePromise = wedgiesOAuthDao
      .deleteAuthorizationCode(body.code as string)
      .then(() => logger().debug("authorization_code delete complete."))
      .catch(logger().error);
  }

  //TODO: what can we performance-optimize here?  Beware cognitive load and dependency hell with access-token-refresher.
  if (body.refresh_token) {
    const wegmansDao = await wegmansDaoPromise;
    let cleanupOldPreRefreshedTokensPromise = Promise.resolve();
    // Wedgies tokens should refresh in sync with wegmans tokens
    const oldWedgiesTokens = await logDuration(
      "getTokensByRefresh",
      wedgiesOAuthDao.getTokensByRefresh(body.refresh_token as string)
    );

    if (config.get("usePreRefreshedTokens")) {
      // First try gettting wegmans tokens from the pre-refreshed tokens table
      const preRefreshedTokens = await logDuration(
        "getPreRefreshedToken",
        wedgiesOAuthDao.getPreRefreshedToken(oldWedgiesTokens.refresh)
      );
      if (preRefreshedTokens) {
        if (!isAccessTokenExpired(preRefreshedTokens)) {
          freshWedgiesTokens = {
            access: preRefreshedTokens.access,
            refresh: preRefreshedTokens.refresh,
          };
        }
        cleanupOldPreRefreshedTokensPromise = logDuration(
          "cleanupOldPreRefreshedTokens",
          wedgiesOAuthDao.deletePreRefreshedTokens(oldWedgiesTokens.refresh)
        );
      }
    }

    if (!freshWedgiesTokens) {
      const oldWegmansTokens = unwrapWedgiesTokens(oldWedgiesTokens.access, jwtSecret);
      const freshWegmansTokens = await logDuration("refreshTokens", wegmansDao.refreshTokens(oldWegmansTokens));

      freshWedgiesTokens = wrapWegmansTokens(freshWegmansTokens, jwtSecret);
      await logDuration(
        "saveAndCleanupTokens",
        Promise.all([
          wedgiesOAuthDao.put(freshWedgiesTokens),
          wedgiesOAuthDao.deleteRefreshCode(oldWedgiesTokens.refresh),
          wedgiesOAuthDao.deleteAccess(oldWedgiesTokens.access),
          cleanupOldPreRefreshedTokensPromise,
        ])
      );
    }
  }

  if (!freshWedgiesTokens || !freshWedgiesTokens.access) {
    throw new Error("No access token found for given code");
  }

  logger().debug("got tokens");
  const expires_in = config.get("jwtOverrideExpiresInSeconds") || secondsTilExpiry(freshWedgiesTokens.access);

  const response: APIGatewayProxyResult = {
    body: JSON.stringify({
      access_token: freshWedgiesTokens.access,
      refresh_token: freshWedgiesTokens.refresh,
      expires_in,
    }),
    statusCode: 200,
    headers: corsHeaders,
  };

  await deletePromise;
  return Promise.resolve(response);
};

const corsHeaders = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
});
