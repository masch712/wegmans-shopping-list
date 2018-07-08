import {WegmansDao} from "../lib/WegmansDao";
import nock = require("nock");
import { ProductSearch } from "../lib/ProductSearch";

// Cool way to mock servers:
// nock("https://sp1004f27d.guided.ss-omtrdc.net")
// .get('/')
// .query({
//   q: query,
//   rank: "rank-wegmans",
//   storeNumber: 59, // TODO: break this out into config
// });

//TODO: STORENUMBER IN USER CONFIG!  DIFF STORES FOR DIFF USERS BRAH

test('searchProducts with empty history', ()=> {
  ProductSearch.searchProducts([], 'whatevs');
});