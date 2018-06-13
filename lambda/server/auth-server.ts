import { Handler, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import * as uuid from 'uuid/v4';
import { WegmansDao } from "../../lib/WegmansDao";
import { KMS } from "aws-sdk";
import config from "../../lib/config";
import { AccessCodeTableItem, accessCodeDao } from "../../lib/AccessCodeDao";

//TODO: abstract all this shit
const kms = new KMS();
let decryptionPromise = Promise.resolve();
if (config.get('wegmans.encrypted')) {
  // Decrypt code should run once and variables stored outside of the function
  // handler so that these are decrypted once per container
  const encryptedKeys = ['wegmans.apikey', 'wegmans.email', 'wegmans.password'];
  const decryptionPromises = [];
  encryptedKeys.forEach(key => {
    decryptionPromises.push(decryptKMS(key));
  });
  config.set('wegmans.encrypted', false);
  decryptionPromise = Promise.all(decryptionPromises).then(() => {});
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
export const authCodeEndpoint: APIGatewayProxyHandler = async function(event, context, callback) : Promise<APIGatewayProxyResult> {
  console.log("Event received: " + JSON.stringify(event, null, 2));
  const code = uuid();
  const body = JSON.parse(event.body);
  const username = body.username;
  const password = body.password;

  const wegmansDao = await wegmansDaoPromise;
  //TODO: give wegmansDao its own npm package?  its own lambda?
  const tokens = await wegmansDao.login(username, password);
  const accessCodeTableItem = new AccessCodeTableItem(tokens.access, tokens.refresh, code);
  if (!await accessCodeDao.tableExists()) {
    await accessCodeDao.createTable();
  }
  await accessCodeDao.put(accessCodeTableItem);


  return {
    statusCode: 200,
    body: JSON.stringify({
      code,
    })
  };
};

/**
 * Given an access code, lookup the access/refresh tokens from the database
 */
// export const accessTokenEndpoint: APIGatewayProxyHandler = async function (event, context, callback): Promise<APIGatewayProxyResult> {
// }