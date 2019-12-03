import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import * as basic from "basic-auth";
import { decode } from "jsonwebtoken";
import * as querystring from "querystring";
import * as uuid from "uuid/v4";
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { config } from "../../lib/config";
import { decryptionPromise } from "../../lib/decrypt-config";
import { logger, logDuration } from "../../lib/Logger";
import { WegmansDao } from "../../lib/WegmansDao";
import { AccessToken, wrapWegmansTokens } from "../../models/AccessToken";

const wegmansDaoPromise = decryptionPromise.then(() => new WegmansDao(config.get("wegmans.apikey")));

/**
 * Accept request from the React Login UI containing username, password
 * Login to wegmans
 * Generate an access code, save it to the database with the given credentials.
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
      statusCode: 200
    };
  }

  const code = uuid();
  const body = JSON.parse(event.body);
  const username = body.username;
  const password = body.password;
  const wegmansDao = await wegmansDaoPromise;
  logger().debug("Got wegmans DAO.  Logging in");

  let tokens: AccessToken;

  // short-circuit for test user
  if (username === "test") {
    logger().debug("Test login found");
    tokens = {
      access: "access_test" + uuid(),
      refresh: "refresh_test" + uuid(),
      user: "user_test" + uuid()
    };
  } else {
    tokens = await wegmansDao.login(username, password);
  }
  logger().debug("Login resolved");
  const accessCodeTableItem: AccessToken = {
    access_code: code,

    access: tokens.access,
    refresh: tokens.refresh,
    user: tokens.user
  };

  await accessCodeDao.initTables();

  logger().debug("Putting accesscodetableitem");
  await accessCodeDao.put(accessCodeTableItem);

  return {
    body: JSON.stringify({
      code
    }),
    headers: corsHeaders,
    statusCode: 200
  };
};

export const getTokens: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === "OPTIONS") {
    return {
      body: "",
      headers: corsHeaders,
      statusCode: 200
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

  const parsedAuth = basic.parse(authHeader)!;
  if (parsedAuth.name !== config.get("alexa.skill.name") || parsedAuth.pass !== config.get("alexa.skill.secret")) {
    throw new Error("Alexa credentials invalid");
  }

  logger().debug("creds are good!");

  const body = querystring.parse(event.body);
  logger().debug("getting tokens");
  let tokens: AccessToken | null = null;
  let deletePromise;

  // If Alexa is sending us an access_code and waants tokens, that means we're finishing up account linking.
  // Get the tokens and delete the access code; don't need it again.
  // https://developer.amazon.com/docs/account-linking/configure-authorization-code-grant.html
  if (body.code) {
    logger().debug("getting token by code");
    tokens = await accessCodeDao.getTokensByCode(body.code as string);

    logger().debug("deleting access code");
    deletePromise = accessCodeDao
      .deleteAccessCode(body.code as string)
      .then(() => logger().debug("access code delete complete."))
      .catch(logger().error);
  }

  //TODO: what can we performance-optimize here?  Beware cognitive load and dependency hell with access-token-refresher.
  if (body.refresh_token) {
    const wegmansDao = await wegmansDaoPromise;
    const oldTokens = await logDuration(
      "getTokensByRefresh",
      accessCodeDao.getTokensByRefresh(body.refresh_token as string)
    );

    // First try gettting tokens from the pre-refreshed tokens table
    const preRefreshedTokens = await logDuration(
      "getPreRefreshedToken",
      accessCodeDao.getPreRefreshedToken(body.refresh_token as string)
    );
    let cleanupOldPreRefreshedTokensPromise = Promise.resolve();
    if (preRefreshedTokens) {
      tokens = {
        access: preRefreshedTokens.access,
        refresh: preRefreshedTokens.refresh,
        user: preRefreshedTokens.user
      };
      cleanupOldPreRefreshedTokensPromise = logDuration(
        "cleanupOldPreRefreshedTokens",
        accessCodeDao.deletePreRefreshedTokens(body.refresh_token as string)
      );
    } else {
      tokens = await logDuration(
        "refreshTokens",
        wegmansDao.refreshTokens(body.refresh_token as string, oldTokens.user)
      );
    }

    await logDuration(
      "saveAndCleanupTokens",
      Promise.all([
        accessCodeDao.put(tokens),
        accessCodeDao.deleteRefreshCode(oldTokens.refresh),
        accessCodeDao.deleteAccess(oldTokens.access),
        cleanupOldPreRefreshedTokensPromise
      ])
    );
  }

  if (!tokens || !tokens.access) {
    throw new Error("No access token found for given code");
  }

  logger().debug("got tokens");

  // tslint:disable-next-line:no-any
  const jwt = decode(tokens.access) as { [key: string]: any };
  const now = Math.floor(new Date().getTime() / 1000);
  // tslint:disable-next-line:variable-name
  const expires_in = jwt.exp - now;
  logger().debug("jwt.exp: " + jwt.exp);
  logger().debug("now: " + now);
  logger().debug("expires_in: " + expires_in);

  const wrappedWegmansTokens = wrapWegmansTokens(tokens, config.get("jwtSecret"));
  const response: APIGatewayProxyResult = {
    body: JSON.stringify({
      access_token: wrappedWegmansTokens,
      refresh_token: wrappedWegmansTokens,
      expires_in
    }),
    statusCode: 200,
    headers: corsHeaders
  };

  await deletePromise;
  return Promise.resolve(response);
};

const corsHeaders = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST"
});
