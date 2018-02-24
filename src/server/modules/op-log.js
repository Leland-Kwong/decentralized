const shortid = require('shortid');
const Now = require('performance-now');

// NOTE: if we're running multiple instances, this allows us to guarantee uniqueness across processes.
const logIdSeed = shortid.generate();
const dbLog = {
  async addEntry(dbOpLog, { bucket, key, actionType, value = '' }) {
    // current time in microseconds. (source)[https://stackoverflow.com/questions/11725691/how-to-get-a-microtime-in-node-js]
    const uid = (Date.now() + Now()) * 10000 + '_' + logIdSeed;
    const putValue = {
      type: 'dbLog',
      meta: `${bucket}\n${key}\n${actionType}`,
      value
    };
    (await dbOpLog).put(uid, putValue);
  },
};

module.exports = (dbInstance) =>
  (logData) => dbLog.addEntry(dbInstance, logData);
