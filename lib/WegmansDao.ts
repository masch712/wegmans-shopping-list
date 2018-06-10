import * as _ from "lodash";
import * as request from "request-promise-native";
import config from "./config";
import { Product } from "../models/Product";
import { logger } from "./Logger";

export class WegmansDao {

  private shoppingListId: number;
  private authToken: string;

  constructor() {
  }

  getAuthToken() {
    return this.authToken;
  }

  async login(email: string, password: string): Promise<void> {
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
      const accessCookie = _.find<string>(err.response.headers['set-cookie'],
        (cookie: string) => !!cookie.match(/wegmans_access=/));
      this.authToken = accessCookie.substring("wegmans_access=".length, accessCookie.indexOf(';'));
      logger.debug('Logged in and saved authToken of length ' + this.authToken.length);
    }

    return;
  }

  async getShoppingListId(): Promise<number> {
    
    if (this.shoppingListId) {
      return this.shoppingListId;
    }
    
    const response = await request.get("https://wegapi.azure-api.net/shoppinglists/all/?api-version=1.0",
      {
        headers: {
          Authorization: this.authToken,
          'Ocp-Apim-Subscription-Key': config.get('wegmans.apikey'),
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
          'Ocp-Apim-Subscription-Key': config.get('wegmans.apikey'),
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