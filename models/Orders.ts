import { StoreProductItem } from "./StoreProductItem";

export interface Orders {
  item_count: number;
  items: Array<OrderSummary>;
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
  allow_substitutions: true;
  line_number: number;
  quantity: number;
  status: "original";
  /** Put my 'added by wedgies' note here */
  customer_comment: string;
  ext_data: {};
  /** formula: store_product.base_price * quantity */
  sub_total: number;
  /** this prop isn't required, but we might as well send it since it seems to always be 'true' and i dont trust wegmans to default it to true in the backend */
  isReorderable: true;
  store_product: StoreProductItem;
  /** this is usually "EA"  */
  uom: string;
}
