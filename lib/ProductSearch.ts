import * as _ from "lodash";
import * as request from "request-promise-native";
import { Product } from "../models/Product";
import { logger } from "./Logger";
import { Response } from "request";
import { OrderedProduct } from "../models/OrderedProduct";
import { DateTime } from "luxon";
import * as jwt from "jsonwebtoken";
import * as Fuse from "fuse.js";

interface ProductSearchResultItem {
  name: string;
  category: string;
  subcategory: string;
  department: string;
  sku: string;
}

export class ProductSearch {

  static async searchForProduct(query: string, storeId: number): Promise<Product | null> {

    const response = await request.get("https://sp1004f27d.guided.ss-omtrdc.net", {
      qs: {
        q: query,
        rank: "rank-wegmans",
        storeNumber: storeId, // TODO: break this out into config
      },
    });
    const body = JSON.parse(response);

    if (!body.results || !body.results.length) {
      return null;
    }

    const firstResult = body.results[0];
    const product = new Product(
      firstResult.name,
      firstResult.category,
      firstResult.subcategory,
      firstResult.department,
      Number.parseInt(firstResult.sku),
    );
    logger.debug("Retrieved product: " + JSON.stringify(product));

    return product;
  }

  static async getProductBySku(skus: string[], storeId: number): Promise<_.Dictionary<Product[]>> {
    const responsePromise = request({
      method: 'POST',
      url: 'https://sp1004f27d.guided.ss-omtrdc.net/',
      form:
        {
          do: 'prod-search',
          i: '1',
          page: '1',
          // q: query,
          sp_c: skus.length,
          sp_n: '1',
          sp_x_20: 'id',
          storeNumber: storeId, //TODO: get storeNumber from JWT?
          sp_q_exact_20: skus.join('|'),
        }
    });
    logger.debug('getting products for skus');
    const response = await responsePromise;
    logger.debug('got products');

    const body = JSON.parse(response);

    const products = (body.results as ProductSearchResultItem[]).map(result => {
      return new Product(
        result.name,
        result.category,
        result.subcategory,
        result.department,
        Number.parseInt(result.sku)
      );
    });

    return _.groupBy(products, 'sku');
  }

  static async searchSkus(skus: number[], query: string, storeId: number): Promise<Product | null> {
    const skuStrings = skus.map(sku => `SKU_${sku}`).join('|');
    const responsePromise = request({
      method: 'POST',
      url: 'https://sp1004f27d.guided.ss-omtrdc.net/',
      form:
        {
          do: 'prod-search',
          i: '1',
          page: '1',
          q: query,
          sp_c: skus.length,
          sp_n: '1',
          sp_x_20: 'id',
          storeNumber: storeId, //TODO: get storeNumber from JWT?
          sp_q_exact_20: skuStrings,
        }
    });

    const skuHash: { [sku: number]: number } = {};
    let skuIndex = 0;
    skus.forEach(sku => { skuHash[sku] = skuIndex++; });

    const response = await responsePromise;

    const body = JSON.parse(response);

    // Find the result with the highest skuIndex (i.e. it was purchased most recently)
    const bestResult = _.maxBy(body.results as ProductSearchResultItem[], (result) => skuHash[Number.parseInt(result.sku)]);

    if (!bestResult) {
      return null;
    }

    const product = new Product(
      bestResult.name,
      bestResult.category,
      bestResult.subcategory,
      bestResult.department,
      Number.parseInt(bestResult.sku),
    );

    return product;
  }

  static searchProducts(products: OrderedProduct[], query: string) {
    const fuse = new Fuse(products, {
      shouldSort: true,
      includeScore: true,
      threshold: 0.15,
      location: 0,
      distance: 100,
      maxPatternLength: 32,
      minMatchCharLength: 1,
      keys: [
        "product.name",
        "product.category",
        "product.subcategory"
      ] as unknown as Array<keyof OrderedProduct> // coerce type to keyof OrderedProducts because typescript doesn't like nested object keys
    });

    const searchResults = fuse.search(query) as Array<{ item: OrderedProduct, score: number }>;
    if (searchResults.length) { logger.debug('fuse found ' + searchResults.length + ' matching products'); }
    else { logger.debug('fuse found nothing for query: ' + query + '; ' + products.length + ' products searhed');}

    const bestProduct = searchResults[0] && _.maxBy(searchResults, result => result.item.purchaseMsSinceEpoch);
    return bestProduct && bestProduct.item.product;
  }

  static async searchForProductPreferHistory(orderedProductsPromise: Promise<OrderedProduct[]>, query: string, storeId: number): Promise<Product | null> {
    // Fire off both requests
    const productPromise = ProductSearch.searchForProduct(query, storeId);
    
    const previouslyOrderedProduct = ProductSearch.searchProducts(await orderedProductsPromise, query);

    // If we found a previously-bought product, return that.  otherwise, wait for the search to resolve.
    return previouslyOrderedProduct || await productPromise;
  }
}
