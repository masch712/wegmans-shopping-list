import { StoreProductItem } from "./StoreProductItem";

export interface Cart {
  items: Array<{
    allow_substitutions: true;
    cart_id: number;
    cart_type: "grocery"; // or other stuff
    checked: false;
    comment: string;
    id: string;
    quantity: number;
    store_product: StoreProductItem;
    subtotal: number;
    item_type: "store_product";
    order_by_weight: boolean;
    product_config?: any;
  }>;
}
