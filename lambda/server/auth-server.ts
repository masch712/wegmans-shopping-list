import { APIGatewayProxyHandler, APIGatewayProxyResult, Handler } from "aws-lambda";
import { KMS } from "aws-sdk";
import * as basic from "basic-auth";
import { decode } from "jsonwebtoken";
import * as querystring from "querystring";
import * as uuid from "uuid/v4";
import { accessCodeDao } from "../../lib/AccessCodeDao";
import { config } from "../../lib/config";
import { decryptionPromise } from "../../lib/decrypt-config";
import { logger } from "../../lib/Logger";
import { WegmansDao } from "../../lib/WegmansDao";
import { AccessToken } from "../../models/AccessToken";

const wegmansDaoPromise = decryptionPromise.then(() => new WegmansDao(config.get("wegmans.apikey")));

/**
 * Accept request from the React Login UI containing username, password
 * Login to wegmans
 * Generate an access code, save it to the database with the given credentials.
 * Overwrite any code that's already in the db for the given user.
 * Respond with the code.
 */
export const generateAuthCode: APIGatewayProxyHandler =
async (event, context, callback): Promise<APIGatewayProxyResult> => {
  logger.debug("Event received: " + JSON.stringify(event, null, 2));
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
  const username = body.username;
  const password = body.password;
  const wegmansDao = await wegmansDaoPromise;
  logger.debug("Got wegmans DAO.  Logging in");

  let tokens: AccessToken;

  // short-circuit for test user
  if (username === "test") {
    logger.debug("Test login found");
    tokens = {
      access: "access_test" + uuid(),
      refresh: "refresh_test" + uuid(),
      user: "user_test" + uuid(),
    };
  } else {
    tokens = await wegmansDao.login(username, password);
  }
  logger.debug("Login resolved");
  const accessCodeTableItem: AccessToken = {
    access_code: code,

    access: tokens.access,
    refresh: tokens.refresh,
    user: tokens.user,
  };

  await accessCodeDao.initTables();

  logger.debug("Putting accesscodetableitem");
  await accessCodeDao.put(accessCodeTableItem);

  return {
    body: JSON.stringify({
      code,
    }),
    headers: corsHeaders,
    statusCode: 200,
  };
};

export const getTokens: APIGatewayProxyHandler =
async (event, context, callback): Promise<APIGatewayProxyResult> => {
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

  await decryptionPromise;

  const parsedAuth = basic.parse(authHeader);
  if (parsedAuth.name !== config.get("alexa.skill.name")
    || parsedAuth.pass !== config.get("alexa.skill.secret")) {
    throw new Error("Alexa credentials invalid");
  }

  logger.debug("creds are good!");

  const body = querystring.parse(event.body);
  logger.debug("request body: " + JSON.stringify(body, null, 2));
  logger.debug("getting tokens");
  let tokens: AccessToken;
  let deletePromise;
  if (body.code) {
    logger.debug("getting token by code");
    tokens = await accessCodeDao.getTokensByCode(body.code as string);

    logger.debug("deleting access code: " + body.code);
    deletePromise = accessCodeDao.deleteAccessCode(body.code as string)
    .then(() => logger.debug("access code delete complete."));
  }
  if (body.refresh_token) {
    logger.debug(`getting token by refresh token: ${body.refresh_token}`);
    const wegmansDao = await wegmansDaoPromise;
    tokens = await accessCodeDao.getTokensByRefresh(body.refresh_token as string);
    tokens = await wegmansDao.refreshTokens(body.refresh_token as string, tokens.user);
    logger.debug(`saving refresh token`);
    await accessCodeDao.put(tokens);
  }

  if (!tokens.access) {
    throw new Error("No access token found for given code");
  }

  logger.debug("got tokens");
  logger.debug("access: " + tokens.access);

  // tslint:disable-next-line:no-any
  const jwt = decode(tokens.access) as { [key: string]: any };
  logger.debug("decoded: " + JSON.stringify(jwt, null, 2));
  const now = Math.floor(new Date().getTime() / 1000);
  // tslint:disable-next-line:variable-name
  const expires_in = jwt.exp - now;

  const response: APIGatewayProxyResult = {
    body: JSON.stringify({
      access_token: tokens.access,
      refresh_token: tokens.refresh,
      expires_in,
    }),
    statusCode: 200,
    headers: corsHeaders,
  };

  await deletePromise;
  logger.debug("Response: " + JSON.stringify(response, null, 2));
  return Promise.resolve(response);
};

const corsHeaders = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
});
