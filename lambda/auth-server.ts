import { Handler, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import * as uuid from 'uuid/v4';
/**
 * Generate an access code, save it to the database with the given credentials
 */
export const authCodeEndpoint: APIGatewayProxyHandler: async function(event, context, callback) : Promise<APIGatewayProxyResult> {
  const accessCode = uuid();
}

/**
 * Given an access code, lookup the access/refresh tokens from the database
 */
export const accessTokenEndpoint: APIGatewayProxyHandler = async function (event, context, callback): Promise<APIGatewayProxyResult> {
}