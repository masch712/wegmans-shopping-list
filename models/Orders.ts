import { StoreProductItem } from "./StoreProductItem";

export interface Orders {
  item_count: number;
  items: Array<{
    can_cancel: boolean;
    can_modify: boolean;
    can_update: boolean;
    fulfillment_type: "pickup";
    id: string;
    /**
     * example: 2020-07-31T04:00:00+00:00
     */
    fulfillment_date: string;
  }>;
}

export interface OrderSummary {
  can_cancel: boolean;
  can_modify: boolean;
  can_update: boolean;
  fulfillment_type: "pickup";
  id: string;
  /**
   * example: 2020-07-31T04:00:00+00:00
   */
  fulfillment_date: string;
}

export interface OrderDetail extends OrderSummary {
  order_items: OrderItem[];
  /**
   * eg.: 2020-07-28T12:50:54.118338-04:00
   */
  timestamp: string;
  /**
   * eg.: 2020-07-31T04:00:00+00:00
   */
  fulfillment_date: string;
}

export interface OrderItem {
  id: string;
  actual_quantity: number;
  line_number: number;
  quantity: number;
  store_product: StoreProductItem;
}
