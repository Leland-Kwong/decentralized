const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const parseGet = require('./parse-get');
const { encodeData } = require('../key-value-store/codecs');
const dbLog = require('./op-log');

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
const logger = dbLog(logDb);
async function addLogEntry(key, changeData) {
  const { bucket, actionType, patch } = changeData;

  if (actionType === 'del') {
    logger({ bucket, key, actionType });
  } else if (actionType === 'patch') {
    logger({ bucket, key, actionType, value: JSON.stringify(patch) });
  } else {
    const encodedValue = encodeData(changeData);
    logger({ bucket, key, actionType, value: encodedValue });
  }
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
