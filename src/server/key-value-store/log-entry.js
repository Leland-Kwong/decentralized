const LexId = require('../../isomorphic/lexicographic-id');

const createEntryId = LexId();

const validActionTypes = [
  'put', 'patch', 'del'
].join(', ');
function createEntry(inputKey, changeData) {
  const { actionType, patch, value } = changeData;
  if (typeof actionType === 'undefined') {
    const errorMsg = `[WriteException]: Received 'undefined' for prop 'actionType'.`
+ ` Expecting one of [${validActionTypes}].`;
    throw errorMsg;
  }
  const { bucket, key } = inputKey;
  const putValue = {
    type: 'dbLog',
    meta: `${bucket}\n${key}\n${actionType}`,
  };

  if (actionType === 'patch') {
    putValue.value = patch;
  } else if (actionType === 'put') {
    putValue.value = value;
  }

  const entryId = createEntryId();
  return { value: putValue, key: { bucket: '_opLog', key: entryId } };
}

module.exports = createEntry;
