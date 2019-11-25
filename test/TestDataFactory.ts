import * as Factory from "factory.ts";
import { Product } from "../models/Product";
import { AccessToken } from "../models/AccessToken";

export const productFactory = Factory.Sync.makeFactory<Product>({
  brand: Factory.each(i => `brand ${i}`),
  category: Factory.each(i => `category ${i}`),
  department: Factory.each(i => `department ${i}`),
  details: Factory.each(i => `details ${i}`),
  name: Factory.each(i => `name ${i}`),
  productLine: Factory.each(i => `productLine ${i}`),
  sku: Factory.each(i => i),
  subcategory: Factory.each(i => `subcategory ${i}`)
});

export const tokenFactory = Factory.Sync.makeFactory<AccessToken>({
  access: Factory.each(i => `access${i}`),
  refresh: Factory.each(i => `refresh${i}`),
  user: Factory.each(i => `user${i}`)
});
