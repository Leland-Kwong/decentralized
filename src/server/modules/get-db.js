const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const { encodeData, decodeData } = require('../key-value-store/codecs');
const LexId = require('../../isomorphic/lexicographic-id');

const encoding = {
  valueEncoding: {
    type: 'multi',
    buffer: false,
    encode: encodeData,
    // TODO: consider removing auto-decoding and let `get` and `createReadStream` functions handle them. This gives us the ability to cache parsed results which will save on cpu for read streams.
    decode: decodeData
  }
};

// databases used for api calls from client
const dbFactory = KV(dbBasePath);

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

const logDb = dbFactory({
  bucket: '_opLog',
  encoding,
  cache: false
});

const createBatch = (() => {
  let currentBatch = null;
  return function createBatch(logDb) {
    if (currentBatch) {
      return currentBatch;
    }
    currentBatch = logDb.batch();
    setTimeout(() => {
      currentBatch.write(onLogAdded);
      currentBatch = null;
    }, 100);
    return currentBatch;
  };
})();

function logChanges(db) {
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
    createBatch(await logDb)
      .put(entry.entryId, entry.value);
  };
  db.on('put', onPut);

  const onDel = async (key) => {
    const changeData = { bucket: db.bucket, actionType: 'del' };
    const entry = createEntry(key, changeData);
    createBatch(await logDb)
      .put(entry.entryId, entry.value);
  };
  db.on('del', onDel);
}

module.exports = (bucket) => {
  const config = {
    bucket,
    encoding,
    onOpened: logChanges
  };
  return dbFactory(config);
};
