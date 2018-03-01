const { normalizedValueMem } = require('../src/server/key-value-store/codecs');
const Perf = require('perf-profile');

function bench(memoize) {
  const items = new Array(10000).fill(0).map(() => {
    return new Array(50).fill(0).map(() => Math.random());
  });
  Perf('encode');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    normalizedValueMem(item, memoize);
    normalizedValueMem(item, memoize);
  }
  console.log(
    Perf('encode').end()
  );
}

for (let i = 0; i < 10; i++) {
  bench(true);
}
