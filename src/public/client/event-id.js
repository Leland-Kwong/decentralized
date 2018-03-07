const availableIds = [];
let idsGenerated = 0;

const usedIds = {};

module.exports = function createEventId(namespace, verbose = false) {
  const idNum = availableIds.length
    ? availableIds.pop()
    : idsGenerated ++;
  let prefix = '';
  if (verbose) {
    prefix = namespace ? namespace + '/' : '';
  }
  const eventId = prefix
    ? prefix + idNum
    : idNum;
  usedIds[eventId] = idNum;
  return eventId;
};

module.exports.availableIds = availableIds;
module.exports.releaseId = (eventId) => {
  const idNum = usedIds[eventId];
  if (typeof idNum === 'undefined') {
    return;
  }
  availableIds.push(idNum);
  delete usedIds[eventId];
};
