const Perf = require('perf-profile');
const levelup = require('levelup');
const encode = require('encoding-down');
const leveldown = require('leveldown');
const fs = require('fs-extra');

const lorem = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const count = 100000;
const items = new Array(count).fill(0).map((_, i) => ({
  key: 'item--' + i,
  data: lorem.substr(0, 5).split(' ')
}));

const db = levelup(
  encode(
    leveldown('./bench/raw-leveldb')
  ), {
    cacheSize: require('bytes')('500MB')
  }
);

const cache = new Map();

function readAndCache(db, onComplete) {
  db.createReadStream({})
    .on('data', (data) => cache.set(data.key, data.value))
    .on('end', onComplete);
}

async function benchWrite(db, onWriteSuccess) {
  return readAndCache(db, onWriteSuccess);

  const batch = db.batch();
  items.forEach((d) => {
    batch.put(d.key, d.data);
  });
  batch.write(() => {
    readAndCache(db, onWriteSuccess);
  });
}

function benchQuery(onData, onComplete) {
  for (const entry of cache) {
    const earlyBreak = onData(entry[0], entry[1]);
    if (earlyBreak) {
      break;
    }
  }
  onComplete();
}

let runCount = 0;
function runAllConcurrently(count, done) {
  const currentRunCount = runCount;
  Perf(`read.${currentRunCount}`);
  const callback = () => {};
  benchQuery(
    (key, value) => {
      if (value) {
        // items.push({ key, value });
        callback();
      }
    },
    () => {
      console.log(Perf(`read.${currentRunCount}`));
      if (runCount === count) {
        done();
      }
    }
  );
  if (++runCount < count) {
    runAllConcurrently(count, done);
  }
}
Perf(`write`);
benchWrite(db, () => {
  console.log(Perf(`write`));
  runAllConcurrently(100, () => {
    // fs.remove('./bench/raw-leveldb');
  });
});
