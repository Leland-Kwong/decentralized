const Memwatch = require('memwatch-next');
const Util = require('util');

/**
* Check for memory leaks
 */
let hd = null;
Memwatch.on('leak', (info) => {
  console.log('memwatch::leak');
  console.error(info);
  if (!hd) {
    hd = new Memwatch.HeapDiff();
  } else {
    const diff = hd.end();
    console.error(Util.inspect(diff, true, null));
    console.log('memwatch::leak', { HeapDiff: hd });
    hd = null;
  }
});

// Memwatch.on('stats', (stats) => {
//   console.log('memwatch::stats');
//   console.error(Util.inspect(stats, true, null));
//   console.log('memwatch::stats', { Stats: stats });
// });
