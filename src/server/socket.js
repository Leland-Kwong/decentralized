// TODO: add syncing support. Syncing works by syncing the db files #mvp
// TODO: user permissions #mvp
// TODO: user management #enhancement
// TODO: add file upload support #enhancement
// TODO: add support for *key* filtering to `db.on`. Right now, each subscription function gets called whenever the database changes. #performance
// TODO: add support for server-side functions #enhancement
// TODO: batch writes to be 20ops/tick? #performance
// TODO: watch '_data' folder and close the database if folder gets deleted
const KV = require('./key-value-store');
const Debug = require('debug');
const { AccessToken } = require('./login');
const shortid = require('shortid');
const queryData = require('../isomorphic/query-data');
const parseGet = require('./api/parse-get');
const delim = require('./api/delim');
const Now = require('performance-now');
const { dbBasePath } = require('./config');
const debug = {
  checkToken: Debug('evds.socket.checkToken'),
  patch: Debug('evds.db.patch'),
  stream: Debug('evds.db.stream')
};
const getTokenFromSocket = (socket) =>
  socket.handshake.query.token;

const io = require('socket.io')();

// NOTE: if we're running multiple instances, this allows us to guarantee uniqueness across processes.
const logIdSeed = shortid.generate();
const dbLog = {
  async addEntry({ bucket, key, actionType, value = '' }) {
    const db = await KV(dbBasePath({ bucket: '_oplog' }));
    // current time in microseconds. (source)[https://stackoverflow.com/questions/11725691/how-to-get-a-microtime-in-node-js]
    const uid = (Date.now() + Now()) * 10000 + '_' + logIdSeed;
    db.put(uid, `dbLog\n${bucket}\n${key}\n${actionType}${delim.v}${value}`);
  },
};

const createSubscribeFn = require('./api/subscribe-fn.js');

io.on('connection', (client) => {
  require('debug')('evds.connect')(client.handshake);

  client.use(async function checkToken(_, next) {
    const token = getTokenFromSocket(client);
    try {
      await AccessToken.verify(token);
    } catch(error) {
      client.emit(error.type, error.message);
      return next();
    }
    next();
  });

  const subscriptions = new Map();

  const onSubscribe = createSubscribeFn(client, subscriptions);
  client.on('subscribe', onSubscribe);
  // subscribe to entire bucket
  client.on('subscribeBucket', (params, callback) => {
    onSubscribe(params, callback);
  });

  async function dbGet ({ bucket, key, query, _ol: offlineEnabled }, fn) {
    try {
      const db = await KV(dbBasePath({ bucket }));
      const value = parseGet(await db.get(key));
      const response = {
        value: offlineEnabled
          ? value // send entire payload for client-side can cache
          : queryData(query, value)
      };
      fn(response);
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
    const db = await KV(dbBasePath({ bucket }));
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

  // cleanup subscriptions
  client.on('disconnect', async () => {
    [...subscriptions].forEach(([, cleanup]) => {
      cleanup();
    });
  });

  const dbPut = require('./api/db-put')(dbLog);
  client.on('put', dbPut);

  const { applyReducer } = require('fast-json-patch');
  const dbPatch = async (data, fn) => {
    const { bucket, key, ops } = data;
    try {
      const db = await (KV(dbBasePath({ bucket })));
      const curValue = parseGet(await db.get(key));
      const parsedOps = JSON.parse(ops);
      const patchResult = parsedOps.reduce(applyReducer, curValue);
      await dbPut({ bucket, key, value: patchResult, patch: ops });
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
