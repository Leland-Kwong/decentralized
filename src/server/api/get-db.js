const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const parseGet = require('./parse-get');
const { encodeData } = require('../key-value-store/codecs');

const dbClientConfig = {
  type: 'client',
  encoding: {
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
  }
};
// databases used for api calls from client
const getDbClient = async (bucket) => {
  return await KV(dbBasePath({ bucket }), dbClientConfig);
};
module.exports = getDbClient;
