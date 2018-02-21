const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const parseGet = require('./parse-get');

const dbClientConfig = {
  encoding: {
    valueEncoding: {
      type: 'multi',
      buffer: false,
      // TODO: setup encoder for writes
      encode: data => data,
      decode: data => {
        return parseGet(data);
      }
    }
  }
};
// databases used for api calls from client
const getDbClient = (bucket) => {
  return KV(dbBasePath({ bucket }), dbClientConfig);
};
module.exports = getDbClient;
