const getDb = require('../src/server/modules/get-db');
const KV = require('../src/server/key-value-store');
const Perf = require('perf-profile');
const debug = require('debug');
const log = (ns, ...rest) => debug(`bench.${ns}`)(...rest);
const Stream = require('../src/server/key-value-store/utils/stream');

const itemCount = 10000;
const lorem = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';
const bucket = `figaro_I_am_a_big_key_${lorem.replace(/[\s,]/g, '_')}`;

function generateItems() {
  Perf('generate items');
  // const list = new Array(1).fill(0).map(() => chance.paragraph());
  const items = new Array(itemCount).fill(0).map((_, i) => {
    return {
      type: 'json',
      actionType: 'put',
      key: {
        bucket,
        key: 'key-' + i,
      },
      value: {
        data: {
          // list
          list: new Array(20).fill(0).map(() => Math.random())
        }
      },
    };
  });

  Perf('json.stringify');
  console.log(
    JSON.stringify(items[0].value).length + bucket.length
  );
  // log('', Perf('generate items'));
  return items;
}

async function bench(insertData) {
  const items = generateItems();
  const db = await getDb('client');

  if (insertData) {
    Perf('batch insert');
    // const batch = db.batch();
    await new Promise((resolve) => {
      let count = 0;
      function onPut(err) {
        if (err) {
          console.log(err);
        }
        count++;
        if (count === items.length) {
          resolve();
        }
      }
      const method = 'putWithLog';
      items.forEach(item => {
        KV[method](db, item.key, item, onPut);
      });

      // const version = Date.now().toString(36);
      // const batch = db.batch();
      // items.forEach(item => {
      //   // item.value.version = version;
      //   batch.put(item.key, item);
      // });
      // batch.write(resolve);
    });
    const perf = Perf('batch insert');
    // await batch.write();
    log('', perf);
  }

  return { db };
}

async function run() {
  const { db } = await bench(true);
  try {
    Perf('read stream');
    let count = 0;
    const streamOptions = { bucket, values: false, limit: itemCount, reverse: true };
    await Stream(db, streamOptions, (data, stream) => {
      if (count >= 1) {
        stream.destroy();
      }
      count++;
    });
    const perf = Perf('read stream');
    console.log(
      perf,
      count
    );

    Perf.resetAll();
  } catch(err) {
    console.error(err);
  }
}

async function readLog() {
  const db = await getDb('client');

  Perf('read opLog');
  let count = 0;
  // const results = [];
  try {
    await Stream(
      db,
      {
        bucket: '_opLog',
        values: false,
        // limit: 10000,
        // reverse: true
      },
      (_, stream) => {
        count++;
        if (count >= 50000) {
          stream.destroy();
        }
        // results.push(data);
      }
    );
  } catch(err) {
    console.log(err);
  }
  console.log(
    count,
    // results.map(v => v.key)
    Perf('read opLog')
  );

  // Perf('js array filter');
  // const filterFn = (v) => {
  //   return parseInt(v.value.parsed.k.slice(4)) > 4500;
  // };
  // const filtered = results.filter(filterFn);
  // log('', Perf('js array filter').end());
  // console.log(
  //   Perf('read opLog').end(),
  //   results.length,
  //   filtered.length,
  //   // JSON.stringify(results[0]).length,
  //   // results[0]
  // );

  Perf('delete db');
  try {
    await db.drop();
  } catch(err) {
    console.error(err);
  }
  log('', Perf('delete db'));
}

let count = 0;

async function runBench(runCount) {
  await run();
  await readLog();
  count++;
  if (count < runCount) {
    runBench(runCount);
  }
}
runBench(5);
