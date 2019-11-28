const request = require("request-promise-native");

async function main() {
  await request.get("https://www.google.com");
}
main();
