import * as _ from "lodash";
import * as request from "request-promise-native";
import { Product } from "../models/Product";
import { logger } from "./Logger";

export interface AccessToken {
  access: string;
  refresh: string;
}
export class WegmansDao {

  private apiKey: string;
  private shoppingListId: number;
  private authToken: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getAuthToken() {
    return this.authToken;
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
      const accessCookie = _.find<string>(err.response.headers['set-cookie'],
        (cookie: string) => !!cookie.match(/wegmans_access=/));
      const refreshCookie = _.find<string>(err.response.headers['set-cookie'],
        (cookie: string) => !!cookie.match(/wegmans_refresh=/));
      if (!accessCookie || !refreshCookie) {
        throw new Error('No access tokens in response; bad login credentials?');
      }
      const access = accessCookie.substring("wegmans_access=".length, accessCookie.indexOf(';'));
      const refresh = refreshCookie.substring("wegmans_refresh=".length, accessCookie.indexOf(';'));
      tokens = { access, refresh};
      this.authToken = access;
      logger.debug('Logged in and saved authToken of length ' + this.authToken.length);
    }

    return Promise.resolve(tokens);
  }

  async getShoppingListId(): Promise<number> {
    
    if (this.shoppingListId) {
      return this.shoppingListId;
    }
    
    const response = await request.get("https://wegapi.azure-api.net/shoppinglists/all/?api-version=1.0",
      {
        headers: {
          Authorization: this.authToken,
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

  async addProductToShoppingList(product: Product, quantity: number = 1): Promise<void> {
    const shoppingListId = await this.getShoppingListId();
    const response = await request("https://wegapi.azure-api.net/shoppinglists/shoppinglistitem/my/?api-version=1.1",
      {
        method: 'POST',
        qs: { 'api-version': '1.1' },
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Authorization': this.authToken,
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