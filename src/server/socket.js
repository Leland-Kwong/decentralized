// TODO: add syncing support. Syncing works by syncing the db files #mvp
// TODO: add support for built-in data types so we can set a default value if it doesn't already exist. For this to work, the developer will also have to pass in a `type` property for write operations.
// TODO: user permissions #mvp
// TODO: user management #enhancement
// TODO: add file upload support #enhancement
// TODO: add support for *key* filtering to `db.on`. Right now, each subscription function gets called whenever the database changes. #performance
// TODO: add support for server-side functions #enhancement
// TODO: add support for batch writes. This way when syncing happens, change events will be throttled. #performance #leveldb.batch
const getDbClient = require('./api/get-db');
const Debug = require('debug');
const { AccessToken } = require('./login');
const queryData = require('../isomorphic/query-data');
const debug = {
  checkToken: Debug('evds.socket.checkToken'),
  patch: Debug('evds.db.patch'),
  stream: Debug('evds.db.stream')
};
const dbLog = require('./api/op-log');
const getTokenFromSocket = (socket) =>
  socket.handshake.query.token;

const io = require('socket.io')();

const createSubscribeFn = require('./api/subscribe-fn.js');

io.on('connection', (client) => {
  require('debug')('evds.server.start.pid')(process.pid);
  // require('debug')('evds.connect')(client.handshake);

  client.use(async function checkToken(_, next) {
    const token = getTokenFromSocket(client);
    try {
      await AccessToken.verify(token);
    } catch(error) {
      // client.emit(error.type, error.message);
      return next(new Error(error.message));
    }
    next();
  });

  const dbSubscriptions = new Map();

  const onSubscribe = createSubscribeFn(client, dbSubscriptions);
  client.on('subscribe', onSubscribe);
  // subscribe to entire bucket
  client.on('subscribeBucket', (params, callback) => {
    onSubscribe(params, callback);
  });

  // TODO: set `fillCache` option to `false` and use a globally shared cache for all stores. This way we can properly manage the caches instead of having each store manage it.
  async function dbGet ({ bucket, key, query }, fn) {
    try {
      const db = await getDbClient(bucket);
      const value = await db.get(key);
      const response = queryData(query, value);
      fn({ value: response });
    } catch(err) {
      if (err.type === 'NotFoundError') {
        fn({ value: null });
        return;
      }
      require('debug')('evds.db.get')(err);
      fn({ error: err.message });
    }
  }
  client.on('get', dbGet);

  const dbDelete = async ({ bucket, key }, fn) => {
    const db = await getDbClient(bucket);
    dbLog.addEntry({ bucket, key, actionType: 'delete' });
    const deleteEntireBucket = typeof key === 'undefined';
    try {
      if (deleteEntireBucket) {
        await db.drop();
      } else {
        await db.del(key);
      }
      fn({});
    } catch(err) {
      require('debug')('db.delete')(err);
      fn({ error: err });
    }
  };
  client.on('delete', dbDelete);

  client.on('disconnect', async () => {
    // cleanup dbSubscriptions
    [...dbSubscriptions].forEach(([, cleanup]) => {
      cleanup();
    });
    dbSubscriptions.clear();
    // cleanup socket client
    const eventNames = client.eventNames();
    eventNames.forEach(name => {
      client.removeAllListeners(name);
    });
  });

  // TODO: add logging to this method #mvp
  const dbPut = require('./api/db-put');
  client.on('put', dbPut);

  const { applyReducer } = require('fast-json-patch');
  const dbPatch = async (data, fn) => {
    const { bucket, key, ops: patchObject } = data;
    try {
      const db = await getDbClient(bucket);
      const curValue = await db.get(key);
      dbLog.addEntry({ bucket, key, actionType: 'patch', value: JSON.stringify(patchObject) });
      const patchResult = patchObject.reduce(applyReducer, curValue);
      const putValue = { type: 'json', value: patchResult };
      await db.put(key, putValue);
      fn({});
    } catch(err) {
      debug.patch(err);
      fn({ error: err.message });
    }
  };

  client.on('patch', dbPatch);
});

module.exports = (server) => {
  io.listen(server);
};
