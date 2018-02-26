const fs = require('fs-extra');
const getDb = require('../src/server/modules/get-db');
const Perf = require('perf-profile');
const chance = require('chance')();
const debug = require('debug');
const log = (ns, ...rest) => debug(`bench.${ns}`)(...rest);

const allResults = {
  data: {},
  add(perf) {
    this.data[new Date().toISOString()] = perf;
  },
  writeToFile(path) {
    fs.writeFile(path, JSON.stringify(this.data, null, 2));
  }
};

async function Stream(db, options, onData) {
  const stream = db.createReadStream(options);
  const _onData = onData || options;
  return new Promise((resolve, reject) => {
    stream.on('data', _onData);
    stream.on('error', reject);
    stream.on('end', resolve);
  });
}

Perf('generate items');
const list = new Array(4).fill(0).map(() => chance.paragraph());
const items = new Array(10000).fill(0).map((_, i) => {
  return {
    type: 'json',
    actionType: 'put',
    value: {
      key: 'key-' + i,
      data: {
        list
      }
    },
    bucket: 'bench.db'
  };
});

log('', Perf('generate items'));

async function setup(insertData) {
  const db = await getDb('bench.db');

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
      items.forEach(item => {
        db.put(item.value.key, item, onPut);
      });
    });
    const perf = Perf('batch insert');
    allResults.add(perf);
    // await batch.write();
    log('', perf);
  }

  function cleanup() {
    return db.drop();
  }

  return { db, cleanup };
}

async function run() {
  try {
    const { db, cleanup } = await setup(true);
    Perf('read stream');
    const results = [];
    await Stream(db, (data) => results.push(data));
    const perf = Perf('read stream');
    console.log(
      perf,
      results.length,
      // results[0].value
    );
    await cleanup();
    Perf.resetAll();
    return perf;
  } catch(err) {
    console.error(err);
  }
}

async function readLog() {
  const opLog = await getDb('_opLog');
  Perf('read opLog');
  const results = [];
  await Stream(
    opLog,
    { limit: 10000, reverse: true },
    (data) => results.push(data)
  );
  Perf('js array filter');
  const filterFn = (v) => {
    return parseInt(v.value.parsed.k.slice(4)) > 4500;
  };
  const filtered = results.filter(filterFn);
  log('', Perf('js array filter').end());
  console.log(
    Perf('read opLog'),
    results.length,
    filtered.length,
    JSON.stringify(filtered[0]).length
  );
}

let count = 0;

async function runBench(runCount) {
  const perfResults = await run();
  allResults.add(perfResults);
  count++;
  if (count < runCount) {
    runBench(runCount);
  } else {
    readLog();
    allResults.writeToFile('./bench/results/db.json');
  }
}
runBench(6);
