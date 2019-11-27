async function delay(ms: number) {
  return new Promise(resolve => {
    setTimeout(() => resolve(), ms);
  });
}

async function manyPromises() {
  for (let index = 0; index < 10; index++) {
    console.log("manyPromises awaiting " + index);
    await delay(100);
  }
}

async function onePromise() {
  console.log("onePromise awaiting");
  await delay(10);
}

async function main() {
  await Promise.race([manyPromises(), onePromise()]);
  console.log("**Race finished");
}

main();
