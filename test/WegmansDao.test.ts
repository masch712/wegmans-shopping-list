import {WegmansDao} from "../lib/WegmansDao";
import nock = require("nock");

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
  WegmansDao.searchProducts([], 'whatevs');
});