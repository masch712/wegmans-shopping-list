import { StoreProductItem } from "./StoreProductItem";

export interface Purchases {
  items: PurchaseSummary[];
}

export interface PurchaseSummary {
  id: number;
  /**
   * eg. "/purchases/186171847"
   */
  href: string;
  item_count: number;
  source: "offline";
  store: { href: string; name: string };
  /**
   * eg. "2020-03-13T11:58:00-04:00"
   */
  timestamp: string;
}

export interface PurchaseDetails extends PurchaseSummary {
  items: PurchaseItem[];
}

export interface PurchaseItem {
  id: number;
  quantity: number;
  store_product: StoreProductItem;
  sub_total: number;
  product_total: number;
}
