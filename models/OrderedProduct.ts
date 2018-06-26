export class OrderedProduct {
  constructor(
    public lastPurchaseDate: string, //TODO: make this a lastPurchaseDate
    public quantity: number,
    public sku: string,
  ) {}
}