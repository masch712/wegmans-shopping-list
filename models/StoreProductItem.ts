export interface StoreProductItem {
  id: string;
  name: string;
  reco_rating: number;
  product_rating: {
    average_rating: number;
    user_count: number;
  };
  fulfillment_types: string[];
  tags: string[];
}
