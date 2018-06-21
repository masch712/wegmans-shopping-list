import * as _ from "lodash";
import * as request from "request-promise-native";
import { Product } from "../models/Product";
import { logger } from "./Logger";
import { AccessToken } from "../models/AccessToken";

export class WegmansDao {

  private apiKey: string;
  private shoppingListId: number;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async login(email: string, password: string): Promise<AccessToken> {
    let tokens: AccessToken;
    try {
      await request({
        method: 'POST',
        url: 'https://www.wegmans.com/j_security_check',
        headers:
          {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache'
          },
        form:
          {
            j_username: email,
            j_password: password,
            j_staysigned: 'on'
          }
      });
    } catch (err) {
      // We get a redirect response, which `request` considers an error.  whotevs
      const access = WegmansDao.getCookie(err.response, 'wegmans_access');
      const refresh = WegmansDao.getCookie(err.response, 'wegmans_refresh');
      const user = WegmansDao.getCookie(err.response, 'wegmans_user');
      if (!access || !refresh) {
        logger.debug(JSON.stringify(err, null, 2));
        throw new Error('No access tokens in response; bad login credentials?');
      }
      tokens = { access, refresh, user};
      logger.debug('Logged in and got access token of length ' + access.length);
    }

    return Promise.resolve(tokens);
  }

  //TODO: pull out auth shit into AcccessCodeDao and rename it to AuthDao
  /**
   * Send a refresh token to Wegmans and get back fresh access and user tokens.
   * @param refreshToken The refresh token
   */
  async refreshTokens(refreshToken: string, userToken: string) : Promise<AccessToken> {
    
    try {
      const jar = request.jar();
      const refreshCookie = request.cookie(`wegmans_refresh=${refreshToken}`);
      const userCookie = request.cookie(`wegmans_user=${userToken}`);
      jar.setCookie(refreshCookie, 'https://www.wegmans.com');
      jar.setCookie(userCookie, 'https://www.wegmans.com');

      await request({
        method: 'GET',
        jar: jar,
        url: 'https://www.wegmans.com/j_security_check',
        headers:
          {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache'
          },
      });
    } catch (err) {
      // We get a redirect response, which `request` considers an error.  whotevs
      const access = WegmansDao.getCookie(err.response, 'wegmans_access');
      const refresh = WegmansDao.getCookie(err.response, 'wegmans_refresh');
      const user = WegmansDao.getCookie(err.response, 'wegmans_user');
      if (!access || !refresh) {
        logger.debug(JSON.stringify(err, null, 2));
        throw new Error('No access tokens in response; bad login credentials?');
      }
      const tokens: AccessToken = { access, refresh, user};
      logger.debug('Logged in and got access token of length ' + access.length);
      return Promise.resolve(tokens);
    }
    
    throw new Error('Unable to refresh access token');
  }

  static getCookie(response: any, cookieKey: string) {
    const cookie = _.find<string>(response.headers['set-cookie'],
        (cookie: string) => !!cookie.match(`${cookieKey}=`));
    if (!cookie) { return; }
    
    const value = cookie.substring(`${cookieKey}=`.length, cookie.indexOf(';'));
    return value;
  }

  async getShoppingListId(accessToken): Promise<number> {
    
    if (this.shoppingListId) {
      return this.shoppingListId;
    }
    
    const response = await request.get("https://wegapi.azure-api.net/shoppinglists/all/?api-version=1.0",
      {
        headers: {
          Authorization: accessToken,
          'Ocp-Apim-Subscription-Key': this.apiKey,
        },
        json: true,
      });

    const shoppingListId = response[0].Id;
    this.shoppingListId = shoppingListId;

    return shoppingListId;
  }

  async searchForProduct(query: string): Promise<Product> {

    const response = await request.get("https://sp1004f27d.guided.ss-omtrdc.net", {
      qs: {
        q: query,
        rank: 'rank-wegmans',
        storeNumber: 59 //TODO: break this out into config
      }
    })
    const body = JSON.parse(response);
    const firstResult = body.results[0];
    const product = new Product(
      firstResult.name,
      firstResult.category,
      firstResult.subcategory,
      firstResult.department,
      firstResult.sku
    );
    logger.debug('Retrieved product: ' + JSON.stringify(product));

    return product;
  }

  async addProductToShoppingList(accessToken: string, product: Product, quantity: number = 1): Promise<void> {
    const shoppingListId = await this.getShoppingListId(accessToken);
    const response = await request("https://wegapi.azure-api.net/shoppinglists/shoppinglistitem/my/?api-version=1.1",
      {
        method: 'POST',
        qs: { 'api-version': '1.1' },
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Authorization': accessToken,
        },
        body: JSON.stringify([
          {
            ShoppingListId: shoppingListId,
            Quantity: quantity,
            Sku: product.sku,
          },
        ]),
        resolveWithFullResponse: true,
      });

    logger.debug('addProducttoShoppingList response status: ' + response.statusCode);

    return;
  }
}