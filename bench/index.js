const getDb = require('../src/server/modules/get-db');
const Perf = require('perf-profile');
const debug = require('debug');
const log = (ns, ...rest) => debug(`bench.${ns}`)(...rest);

async function Stream(db, options, onData) {
  const stream = db.createReadStream(options);
  const _onData = onData || options;
  return new Promise((resolve, reject) => {
    stream.on('data', _onData);
    stream.on('error', reject);
    stream.on('end', resolve);
  });
}

const itemCount = 10000;
function generateItems() {
  Perf('generate items');
  // const list = new Array(1).fill(0).map(() => chance.paragraph());
  const items = new Array(itemCount).fill(0).map((_, i) => {
    return {
      type: 'json',
      actionType: 'put',
      key: {
        bucket: 'figaro',
        key: 'key-' + i,
      },
      value: {
        data: {
          // list
          list: new Array(50).fill(0).map(() => Math.random())
        }
      },
      bucket: 'bench.db'
    };
  });

  console.log(
    JSON.stringify(items[0].value).length
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
      function onPut() {
        count++;
        if (count === items.length) {
          resolve();
        }
      }
      const method = 'putWithLog';
      items.forEach(async item => {
        const db = await getDb('client');
        db[method](item.key, item, onPut);
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
    await db.drop();
    // Perf('read stream');
    // let count = 0;
    // await Stream(db, { values: false, limit: itemCount, reverse: true }, () => {
    //   count++;
    // });
    // const perf = Perf('read stream');
    // console.log(
    //   perf,
    //   count
    // );

    Perf.resetAll();
  } catch(err) {
    console.error(err);
  }
}

async function readLog() {
  const db = await getDb('client');

  Perf('read opLog');
  const results = [];
  await Stream(
    db,
    {
      gte: { bucket: '_opLog', key: '' },
      lte: { bucket: '_opLog', key: '~' },
      values: false,
      limit: 10000,
      reverse: true
    },
    (data) => results.push(data)
  );
  console.log(
    results.length,
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
  count++;
  if (count < runCount) {
    runBench(runCount);
  } else {
    readLog();
  }
}
runBench(10);
