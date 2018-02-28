const getDb = require('../src/server/modules/get-db');
const Perf = require('perf-profile');

async function test() {
  Perf('open many dbs');
  Promise.all(
    new Array(1500).fill(0).map(async (_, i) => {
      await getDb(`bench.db.${i}`);
    })
  ).then(() => {
    console.log(Perf('open many dbs'));
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 1000000);
  });
}

test();
console.log(process.pid);
