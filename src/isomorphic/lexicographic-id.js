const lexi = require('lexicographic-integer');

const radix = 36;
const packedCountsHistory = [];
let maxHistorySize = 2000;

function LexicographicId() {
  let lastTimestamp = 0;
  let count = 0;
  let maxCount = 0;

  return function generate() {
    // current time as hexadecimal
    const tsHex = Date.now().toString(radix);
    let id = tsHex;

    if (lastTimestamp === tsHex) {
      const fromCache = packedCountsHistory[count];
      const packedCount = fromCache || lexi.pack(count, 'hex');
      id += '.' + packedCount;
      if (!fromCache && count < maxHistorySize) {
        packedCountsHistory[count] = packedCount;
      }
      count++;
    }
    else {
      // update maxCount (this is only used as information for performance tuning)
      if (count > maxCount) {
        maxCount = count;
      }
      // reset counter
      count = 0;
    }
    lastTimestamp = tsHex;
    return id;
  };
}

module.exports = LexicographicId;
module.exports.packedCountsHistory = packedCountsHistory;
module.exports.setMaxHistorySize = (max) => maxHistorySize = max;
module.exports.getTimeMS = (id) => parseInt(id.split('.')[0], radix);
