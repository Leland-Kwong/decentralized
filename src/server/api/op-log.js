const shortid = require('shortid');
const Now = require('performance-now');
const getDbClient = require('./get-db');

// NOTE: if we're running multiple instances, this allows us to guarantee uniqueness across processes.
const logIdSeed = shortid.generate();
const dbLog = {
  async addEntry({ bucket, key, actionType, value = '' }) {
    const db = await getDbClient('_opLog');
    // current time in microseconds. (source)[https://stackoverflow.com/questions/11725691/how-to-get-a-microtime-in-node-js]
    const uid = (Date.now() + Now()) * 10000 + '_' + logIdSeed;
    const putValue = {
      type: 'dbLog',
      meta: `${bucket}\n${key}\n${actionType}`,
      value
    };
    db.put(uid, putValue);
  },
};

module.exports = dbLog;
