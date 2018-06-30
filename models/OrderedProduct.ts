export class OrderedProduct {
  constructor(
    public purchaseMsSinceEpoch: number, //TODO: make this a lastPurchaseDate
    public quantity: number,
    public sku: number,
  ) {}
}