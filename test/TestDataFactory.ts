import * as Factory from "factory.ts";
import { Product } from "../models/Product";
import { WedgiesOAuthToken } from "../models/AccessToken";
import * as jwt from "jsonwebtoken";
import { StoreProductItem } from "../models/StoreProductItem";
import { BrowserLoginTokens } from "../models/BrowserLoginTokens";
import { CfnUserToGroupAddition } from "@aws-cdk/aws-iam";
import * as uuid from "uuid/v4";
import { Cookie } from "tough-cookie";

export const productFactory = Factory.Sync.makeFactory<StoreProductItem>({
  name: Factory.each((i) => `name ${i}`),
  id: Factory.each((i) => `${i}`),
  fulfillment_types: ["pickup"],
  product_rating: Factory.each((i) => ({
    average_rating: i / 5,
    user_count: 100,
  })),
  reco_rating: Factory.each((i) => i / 5),
  tags: ["wegmans"],
});

export const FAKE_JWT_SECRET = "niner";
// export const tokenFactory = Factory.Sync.makeFactory<WedgiesOAuthToken>({
//   access: jwt.sign(
//     {
//       exp: new Date().valueOf() / 1000 + 3600,
//       iat: new Date().valueOf() / 1000,
//     },
//     FAKE_JWT_SECRET
//   ),
//   refresh: Factory.each((i) => `refresh${i}`),
// });
export const tokenFactory = Factory.Sync.makeFactory<BrowserLoginTokens>({
  session_token: Factory.each((i) =>
    jwt.sign(
      {
        iat: new Date().valueOf() / 1000,
        user_id: i,
      },
      "test"
    )
  ),
  cookies: Factory.each((i) => ({
    "session-prd-weg": new Cookie({
      key: "session-prd-weg",
      value: `${i}`,
      maxAge: 86400,
    }).toString(),
  })),
});
