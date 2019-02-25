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
  brand: string;
  details: string;
  productLine: string;
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

    const firstResult = body.results[0] as ProductSearchResultItem;
    const product: Product = {
      ...firstResult,
      sku: Number.parseInt(firstResult.sku),
    };
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
      return {
        ...result,
        sku: Number.parseInt(result.sku),
      };
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

    const product: Product = {
      ...bestResult,
      sku: Number.parseInt(bestResult.sku),
    };

    return product;
  }

  static searchOrderedProducts(products: OrderedProduct[], query: string) {
    const fuse = new Fuse(products, {
      shouldSort: true,
      includeScore: true,
      tokenize: true,
      location: 0,
      threshold: 0.15,
      distance: 100,
      maxPatternLength: 32,
      minMatchCharLength: 1,
      keys: [
        "product.name",
        "product.category",
        "product.subcategory",
        // TODO: add brand and details to dynamo schema?
        "product.brand",
        // "product.details",
      ] as unknown as Array<keyof OrderedProduct> // coerce type to keyof OrderedProducts because typescript doesn't like nested object keys
    });

    const searchResults = fuse.search(query) as Array<{ item: OrderedProduct, score: number }>;
    if (searchResults.length) { logger.debug('fuse found ' + searchResults.length + ' matching products'); }
    else { logger.debug('fuse found nothing for query: ' + query + '; ' + products.length + ' products searhed');}

    const bestProduct = searchResults[0] && _.maxBy(searchResults, result => result.item.purchaseMsSinceEpoch);
    return bestProduct ? bestProduct.item.product : null;
  }

  static searchProductsSecondPass(products: Product[], query: string) {
    const fuse = new Fuse(products, {
      shouldSort: true,
      includeScore: true,
      tokenize: true,
      location: 0,
      threshold: 0.15,
      distance: 100,
      maxPatternLength: 32,
      minMatchCharLength: 1,
      keys: [
        "name",
        "category",
        "subcategory",
        "brand",
        "details",
      ],
    });

    const searchResults = fuse.search(query);
    // If a product other than the 0-indexed product is the best match,
    // it better have a score that's 0.5 better than the next one
    const bestScore = (searchResults[0]).score!;
    if (searchResults.length > 1 && bestScore < _.last(searchResults)!.score! - 0.5) {
      return searchResults[0].item;
    }
    else {
      return products[0];
    }
  }

  static async searchForProductPreferHistory(orderedProducts: OrderedProduct[], query: string, storeId: number): Promise<Product | null> {
    // Get the candidates in order of preference
    const candidates = await Promise.all([
      // Best: 
      ProductSearch.searchSkus(orderedProducts.map(op => op.sku), query, storeId),
      ProductSearch.searchOrderedProducts(orderedProducts, query),
      ProductSearch.searchForProduct(query, storeId),
    ]);

    logger.info("search query: " + query);
    logger.info(JSON.stringify({ orderedProducts }));
    logger.info("Wegmans purchase history search result: " + JSON.stringify(candidates[0]));
    logger.info("Fuse purchase history search result: " + JSON.stringify(candidates[1]));
    logger.info("Wegmans search result: " + JSON.stringify(candidates[1]));

    const nonNullCandidates = _.filter(candidates, (c): c is Product => !!c);
    const secondPass = ProductSearch.searchProductsSecondPass(nonNullCandidates, query);
    return secondPass;
  }
}
