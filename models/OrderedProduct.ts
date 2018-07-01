export class OrderedProduct {
  constructor(
    public purchaseMsSinceEpoch: number,
    public quantity: number,
    public sku: number,
  ) {}
}