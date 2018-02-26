const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const parseGet = require('./parse-get');
const { encodeData } = require('../key-value-store/codecs');
const LexId = require('../../isomorphic/lexicographic-id');
const { validateBucket } = require('./validate-db-paths');

const encoding = {
  valueEncoding: {
    type: 'multi',
    buffer: false,
    encode: encodeData,
    // TODO: consider removing auto-decoding and let `get` and `createReadStream` functions handle them. This gives us the ability to cache parsed results which will save on cpu for read streams.
    decode: data => {
      const parsed = parseGet(data);
      return {
        parsed,
        raw: data,
      };
    }
  }
};

// databases used for api calls from client
const dbBase = KV(dbBasePath);
const getDbClient = async (config) => {
  validateBucket(config.bucket);
  return await dbBase(config);
};

const createEntryId = LexId();
const PUT_TYPE = 'dbLog';
function onLogAdded(err) {
  if (err) console.error(err);
}
function createEntry(key, changeData) {
  const { bucket, actionType, patch, value } = changeData;
  const putValue = {
    type: PUT_TYPE,
    meta: `${bucket}\n${key}\n${actionType}`,
  };

  if (actionType === 'patch') {
    putValue.value = patch;
  } else if (actionType === 'put') {
    putValue.value = value;
  }

  const entryId = createEntryId();
  return { value: putValue, entryId };
}

async function logChanges(db) {
  const logDb = getDbClient({ bucket: '_opLog', encoding });

  const onBatch = async (ops) => {
    const batch = (await logDb).batch();
    for (let i = 0; i < ops.length; i++) {
      const { key, value: changeData } = ops[i];
      const entry = createEntry(key, changeData);
      batch.put(entry.entryId, entry.value);
    }
    batch.write(onLogAdded);
  };
  db.on('batch', onBatch);

  const onPut = async (key, changeData) => {
    const entry = createEntry(key, changeData);
    (await logDb).put(entry.entryId, entry.value, onLogAdded);
  };
  db.on('put', onPut);

  const onDel = async (key) => {
    const changeData = { bucket: db.bucket, actionType: 'del' };
    const entry = createEntry(key, changeData);
    (await logDb).put(entry.entryId, entry.value, onLogAdded);
  };
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
