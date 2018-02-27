const availableIds = [];
let idsGenerated = 0;

module.exports = function createEventId(namespace, verbose = false) {
  if (availableIds.length) {
    return availableIds.pop();
  }
  let prefix = '';
  if (verbose) {
    prefix = namespace ? namespace + '/' : '';
  }
  const eventId = prefix + idsGenerated;
  idsGenerated++;
  return eventId;
};

module.exports.availableIds = availableIds;

const freeUpEventId = (id) => {
  availableIds.push(id);
};

module.exports.freeUpEventId = freeUpEventId;
