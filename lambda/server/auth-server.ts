import { Handler, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import * as uuid from 'uuid/v4';
import { WegmansDao, AccessToken } from "../../lib/WegmansDao";
import { KMS } from "aws-sdk";
import config from "../../lib/config";
import { AccessCodeTableItem, accessCodeDao } from "../../lib/AccessCodeDao";
import { logger } from "../../lib/Logger";
import * as basic from "basic-auth";
import * as querystring from 'querystring';

//TODO: abstract all this shit
const kms = new KMS();
let decryptionPromise = Promise.resolve();
if (config.get('encrypted')) {
  // Decrypt code should run once and variables stored outside of the function
  // handler so that these are decrypted once per container
  const encryptedKeys = ['wegmans.apikey', 'alexa.skill.secret'];
  const decryptionPromises = [];
  encryptedKeys.forEach(key => {
    // Only decrypt if there's data to decrypt
    if (config.get(key)) {
      decryptionPromises.push(decryptKMS(key));
    }
  });
  config.set('encrypted', false);
  decryptionPromise = Promise.all(decryptionPromises).then(() => { });
}

async function decryptKMS(key): Promise<void> {
  return new Promise<void>((resolve, reject) => {

    const encrypted = config.get(key);
    let decrypted;
    kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
      if (err) {
        reject(err);
      }
      else {
        config.set(key, data.Plaintext.toString());
        resolve();
      }
    });
  });
}
const wegmansDaoPromise = decryptionPromise.then(() => new WegmansDao(config.get('wegmans.apikey')));

/**
 * Accept request from the React Login UI containing username, password
 * Login to wegmans
 * Generate an access code, save it to the database with the given credentials.
 * Overwrite any code that's already in the db for the given user.
 * Respond with the code.
 */
export const generateAuthCode: APIGatewayProxyHandler = async function (event, context, callback): Promise<APIGatewayProxyResult> {
  console.log("Event received: " + JSON.stringify(event, null, 2));
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      body: '',
      headers: corsHeaders,
    };
  }
  
  const code = uuid();
  const body = JSON.parse(event.body);
  const username = body.username;
  const password = body.password;
  //TODO: write some damn tests
  const wegmansDao = await wegmansDaoPromise;
  logger.debug('Got wegmans DAO.  Logging in');
  //TODO: give wegmansDao its own npm package?  its own lambda?

  let tokens: AccessToken;

  // short-circuit for test user
  //TODO: factor into env var?
  if (username === 'test') {
    logger.debug('Test login found');
    tokens = {
      access: 'access_test' + uuid(),
      refresh: 'refresh_test' + uuid(),
    };
  }
  else {
    tokens = await wegmansDao.login(username, password);
  }
  logger.debug('Login resolved');
  const accessCodeTableItem = new AccessCodeTableItem(tokens.access, tokens.refresh, code);

  if (!await accessCodeDao.tableExists()) {
    logger.debug('Creating table');
    await accessCodeDao.createTable();
  }

  logger.debug('Putting accesscodetableitem');
  await accessCodeDao.put(accessCodeTableItem);


  return {
    statusCode: 200,
    body: JSON.stringify({
      code,
    }),
    headers: corsHeaders,
  };
};

export const getTokensByAuthCode: APIGatewayProxyHandler = async function (event, context, callback): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      body: '',
      headers: corsHeaders,
    };
  }

  const authHeader = event.headers.Authorization;
  if (!authHeader) {
    throw new Error('No Authorization header found');
  }

  const parsedAuth = basic.parse(authHeader);
  if (parsedAuth.name !== config.get('alexa.skill.name')
    || parsedAuth.pass !== config.get('alexa.skill.secret')) {
    throw new Error('Alexa credentials invalid');
  }

  logger.debug('creds are good!');
  const body = querystring.parse(event.body);
  
  logger.debug('getting tokens');
  const tokens = await accessCodeDao.getTokens(body.code as string);
  if (!tokens.access_token) {
    throw new Error('No access token found for given code');
  }

  logger.debug('got tokens');
  const response: APIGatewayProxyResult = {
    body: JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token }),
    statusCode: 200,
    headers: corsHeaders,
  };

  return Promise.resolve(response);
}

const corsHeaders = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
});

/**
 * Given an access code, lookup the access/refresh tokens from the database
 */
// export const accessTokenEndpoint: APIGatewayProxyHandler = async function (event, context, callback): Promise<APIGatewayProxyResult> {
// }