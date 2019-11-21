import * as _ from "lodash";
import * as request from "request-promise-native";
import { Product } from "../models/Product";
import { logger, logDuration } from "./Logger";
import { Response } from "request";
import { OrderedProduct } from "../models/OrderedProduct";
import { DateTime } from "luxon";
import * as jwt from "jsonwebtoken";
import * as Fuse from "fuse.js";
import { LoggedEvent } from "../models/LoggedEvent";
import { productRequestHistoryDao } from "./ProductRequestHistoryDao";

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
  static async wegmansSearchForProduct(
    query: string,
    storeId: number
  ): Promise<Product | null> {
    // Sanitize the query because the search service doesnt like hyphens (eg. "extra-virgin olive oil")
    const sanitizedQuery = query.replace(/-/g, " ");
    const response = await request.get(
      "https://sp1004f27d.guided.ss-omtrdc.net",
      {
        strictSSL: false, //TODO: there's an expired cert in the chain at the moment.  Remove this when they renew their cert.
        qs: {
          q: sanitizedQuery,
          rank: "rank-wegmans",
          storeNumber: storeId // TODO: break this out into config
        }
      }
    );
    const body = JSON.parse(response);

    if (!body.results || !body.results.length) {
      return null;
    }

    const firstResult = body.results[0] as ProductSearchResultItem;
    const product: Product = {
      ...firstResult,
      sku: Number.parseInt(firstResult.sku, 10)
    };

    return product;
  }

  static async getProductBySku(
    skus: string[],
    storeId: number
  ): Promise<_.Dictionary<Product[]>> {
    const responsePromise = request({
      method: "POST",
      url: "https://sp1004f27d.guided.ss-omtrdc.net/",
      strictSSL: false, //TODO: there's an expired cert in the chain at the moment.  Remove this when they renew their cert.
      form: {
        do: "prod-search",
        i: "1",
        page: "1",
        // q: query,
        sp_c: skus.length,
        sp_n: "1",
        sp_x_20: "id",
        storeNumber: storeId, //TODO: get storeNumber from JWT?
        sp_q_exact_20: skus.join("|")
      }
    });
    logger.debug("getting products for skus");
    const response = await responsePromise;
    logger.debug("got products");

    const body = JSON.parse(response);

    const products = (body.results as ProductSearchResultItem[]).map(result => {
      return {
        ...result,
        sku: Number.parseInt(result.sku)
      };
    });

    return _.groupBy(products, "sku");
  }

  static async wegmansSearchSkus(
    skus: number[],
    query: string,
    storeId: number
  ): Promise<Product | null> {
    const skuStrings = skus.map(sku => `SKU_${sku}`).join("|");
    const postForm = {
      do: "prod-search",
      i: "1",
      page: "1",
      q: query,
      sp_c: skus.length,
      sp_n: "1",
      sp_x_20: "id",
      storeNumber: storeId, //TODO: get storeNumber from JWT?
      sp_q_exact_20: skuStrings
    };
    logger.silly(
      new LoggedEvent("wegmansSearchSkus")
        .addProperty("form", postForm)
        .toString()
    );
    const responsePromise = request({
      method: "POST",
      url: "https://sp1004f27d.guided.ss-omtrdc.net/",
      strictSSL: false, //TODO: there's an expired cert in the chain at the moment.  Remove this when they renew their cert.
      form: postForm
    }).then(_.identity());

    const skuHash: { [sku: number]: number } = {};
    let skuIndex = 0;
    skus.forEach(sku => {
      skuHash[sku] = skuIndex++;
    });

    const response = await logDuration(
      "wegmansSearchSkusRequest",
      responsePromise
    );

    const body = JSON.parse(response);

    // Find the result with the highest skuIndex (i.e. it was purchased most recently)
    const bestResult = _.maxBy(
      body.results as ProductSearchResultItem[],
      result => skuHash[Number.parseInt(result.sku)]
    );

    if (!bestResult) {
      return null;
    }

    const product: Product = {
      ...bestResult,
      sku: Number.parseInt(bestResult.sku)
    };

    return product;
  }

  static fuseSearchOrderedProducts(products: OrderedProduct[], query: string) {
    const fuse = new Fuse(products, {
      shouldSort: true,
      includeScore: true,
      tokenize: true,
      location: 0,
      threshold: 0.15,
      distance: 100,
      maxPatternLength: 32,
      minMatchCharLength: 1,
      keys: ([
        "product.name",
        "product.category",
        "product.subcategory",
        "product.brand"
        // "product.details",
      ] as unknown) as Array<keyof OrderedProduct> // coerce type to keyof OrderedProducts because typescript doesn't like nested object keys
    });

    const searchResults = fuse.search(query) as Array<{
      item: OrderedProduct;
      score: number;
    }>;

    const bestProduct =
      searchResults[0] &&
      _.maxBy(searchResults, result => result.item.purchaseMsSinceEpoch);
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
        "productLine"
      ]
    });

    const searchResults = fuse.search(query);
    // If a product other than the 0-indexed product is the best match,
    // it better have a score that's 0.15 better than the next one
    const bestScore: number | undefined =
      searchResults && searchResults[0] && searchResults[0].score!;
    if (searchResults.length > 0) {
      //1 && bestScore < _.last(searchResults)!.score! - 0.15) {
      return searchResults[0].item;
    } else {
      return products[0];
    }
  }

  static getMostCommonProductBySku(products: Product[]): Product | null {
    const productsBySku = _.groupBy(products, product => product.sku);
    const modeProducts = _.maxBy(
      Object.values(productsBySku),
      skuProducts => skuProducts.length
    );
    if (modeProducts && modeProducts.length > 1) {
      return modeProducts[0];
    }
    return null;
  }

  static async searchForProductPreferHistory(
    orderedProducts: OrderedProduct[],
    query: string,
    storeId: number
  ): Promise<Product | null> {
    // Get the candidates in order of preference

    const candidates = await Promise.all([
      // Best:
      logDuration(
        "wegmansHistorySearch",
        ProductSearch.wegmansSearchSkus(
          orderedProducts.map(op => op.sku),
          query,
          storeId
        )
      ),
      logDuration(
        "fuseHistorySearch",
        (async () =>
          ProductSearch.fuseSearchOrderedProducts(orderedProducts, query))()
      ),
      logDuration(
        "wegmansProductSearch",
        ProductSearch.wegmansSearchForProduct(query, storeId)
      )
    ]);

    logger.info("search query: " + query);
    logger.info(
      "Wegmans purchase history search result: " + JSON.stringify(candidates[0])
    );
    logger.info(
      "Fuse purchase history search result: " + JSON.stringify(candidates[1])
    );
    logger.info("Wegmans search result: " + JSON.stringify(candidates[2]));

    const nonNullCandidates = _.filter(
      candidates,
      (c): c is Product => !!c && !!c.sku
    );

    const modeSkuProduct = ProductSearch.getMostCommonProductBySku(
      nonNullCandidates
    );
    if (modeSkuProduct) {
      return modeSkuProduct;
    }

    const secondPass = ProductSearch.searchProductsSecondPass(
      nonNullCandidates,
      query
    );
    return secondPass;
  }
}
