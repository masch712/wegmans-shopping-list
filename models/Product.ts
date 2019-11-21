export interface Product {
  productLine: any;
  name: string;
  category: string;
  subcategory: string;
  department: string;
  sku: number;
  brand: string;
  details: string;
}

export function getStringyProduct(product: Product) {
  return [
    product.name,
    product.brand,
    product.category,
    product.subcategory,
    product.department,
    product.productLine
  ]
    .join(" ")
    .toLowerCase();
}
