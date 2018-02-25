// TODO: make into a factory method so we can have separate instances
// TODO: add option to turn off lexicographic count value #performance

const lexi = require('lexicographic-integer');
let lastTimestamp = 0;
let count = 0;
let maxCount = 0;

const packedCountsHistory = [];
let maxHistorySize = 2000;
const radix = 36;

function createEntryId() {
  // current time as hexadecimal
  const tsHex = Date.now().toString(radix);
  let id = tsHex;

  if (lastTimestamp === tsHex) {
    const fromCache = packedCountsHistory[count];
    const packedCount = fromCache || lexi.pack(count, 'hex');
    id += '.' + packedCount;
    if (count < maxHistorySize) {
      packedCountsHistory[count] = packedCount;
    }
    count++;
  }
  else {
    if (count > maxCount) {
      maxCount = count;
    }
    // reset counter
    count = 0;
  }
  lastTimestamp = tsHex;
  return id;
}

module.exports = createEntryId;
module.exports.getMaxCount = () => maxCount;
module.exports.packedCountsHistory = packedCountsHistory;
module.exports.setMaxHistorySize = (max) => maxHistorySize = max;
module.exports.getTimeMS = (id) => parseInt(id.split('.')[0], radix);
