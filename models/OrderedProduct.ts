import { Product } from "./Product";

export interface OrderedProduct {
  purchaseMsSinceEpoch: number;
  quantity: number;
  sku: number;
  product?: Product;
}

export interface OrderedProductForDynamo {
  purchaseMsSinceEpoch: number;
  quantity: number;
  sku: number;
  product?: Partial<Product>;
}