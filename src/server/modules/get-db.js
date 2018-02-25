const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const parseGet = require('./parse-get');
const { encodeData } = require('../key-value-store/codecs');
const createEntryId = require('../../isomorphic/lexicographic-id');

const encoding = {
  valueEncoding: {
    type: 'multi',
    buffer: false,
    encode: encodeData,
    // TODO: consider removing auto-decoding and let `get` and `createReadStream` functions handle them. This gives us the ability to cache parsed results which will save on cpu for read streams.
    decode: data => {
      return {
        parsed: parseGet(data),
        raw: data
      };
    }
  }
};

// databases used for api calls from client
const getDbClient = async (config) => {
  return await KV(dbBasePath, config);
};

const logDb = getDbClient({ bucket: '_opLog', encoding });
const PUT_TYPE = 'dbLog';
function onLogAdded(err) {
  if (err) console.error(err);
}
async function addLogEntry(key, changeData) {
  const { bucket, actionType, patch, value } = changeData;

  const putValue = {
    type: PUT_TYPE,
    meta: `${bucket}\n${key}\n${actionType}`,
  };

  const entryId = createEntryId();
  if (actionType === 'patch') {
    putValue.value = patch;
  } else if (actionType === 'put') {
    putValue.value = value;
  }

  (await logDb).put(entryId, putValue, onLogAdded);
}

function logChanges(db) {
  db.on('put', addLogEntry);
  const onDel = (key) =>
    addLogEntry(key, { bucket: db.bucket, actionType: 'del' });
  db.on('del', onDel);
}

module.exports = (bucket) => {
  const config = {
    bucket,
    encoding,
    onOpened: logChanges
  };
  return getDbClient(config);
};
