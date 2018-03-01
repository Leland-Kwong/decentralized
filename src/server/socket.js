// TODO: create method for dbNsEvent calls so we group them together and keep things dry.
// TODO: user permissions #mvp
// TODO: add syncing support. Syncing works by syncing the db files #mvp
// TODO: add request throttling
// TODO: add support for built-in data types so we can set a default value if it doesn't already exist. For this to work, the developer will also have to pass in a `type` property for write operations. #enhancement
// TODO: user management #enhancement
// TODO: add file upload support #enhancement
// TODO: add support for *key* filtering to `db.on('put')` when watching a keypath of {bucket}/{key}. Right now, each subscription function gets called whenever the bucket changes. #performance
// TODO: add support for server-side functions #enhancement
// TODO: add support for batch writes. This way when syncing happens, change events will be throttled. #performance #leveldb.batch
const getDbClient = require('./modules/get-db');
const Debug = require('debug');
const debug = {
  checkToken: Debug('evds.socket.checkToken'),
  patch: Debug('evds.db.patch'),
  stream: Debug('evds.db.stream')
};

const createSubscribeFn = require('./modules/subscribe-fn.js');

const handleClientConnection = (dbAccessControl) => (client) => {
  require('debug')('evds.server.start.pid')(process.pid);
  // require('debug')('evds.connect')(client.handshake);

  client.use(async function checkAccess(packet, next) {
    if (dbAccessControl) {
      const [event, args] = packet;
      return dbAccessControl(event, args, client, next);
    }
    const msg = 'Access control function missing. For security reasons, an'
    + 'access control function must be provided.';
    next(new Error(msg));
  });

  const dbSubscriptions = new Map();

  const onSubscribe = createSubscribeFn(client, dbSubscriptions);
  client.on('subscribe', onSubscribe);
  // subscribe to entire bucket
  client.on('subscribeBucket', (params, callback) => {
    onSubscribe(params, callback);
  });

  client.on('get', require('./modules/db-get'));

  const dbDel = require('./modules/db-del');
  client.on('delete', dbDel);

  client.on('disconnect', () => {
    try {
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
    }
    catch(err) {
      require('debug')('db.cleanup.error', err);
    }
  });

  const dbPut = require('./modules/db-put');
  client.on('put', dbPut);

  const { applyReducer } = require('fast-json-patch');
  const defaultPatchValue = () => ({});
  const dbPatch = async (data, fn) => {
    const { bucket, key, ops: patchObject, storeName = 'client' } = data;
    try {
      const db = await getDbClient(storeName);
      const nsKey = { bucket, key };
      const curValue = await db.get(nsKey) || defaultPatchValue();

      const isPlainObject = curValue && typeof curValue === 'object';
      if (!isPlainObject) {
        return fn({
          error: 'cannot apply patch to non-object',
          type: 'PatchException'
        });
      }

      const patchResult = patchObject.reduce(applyReducer, curValue);
      const putValue = {
        type: 'json',
        value: patchResult,
        patch: patchObject,
        actionType: 'patch',
      };
      await db.putWithLog(nsKey, putValue);
      fn({});
    } catch(err) {
      debug.patch(err);
      fn({ error: err.message });
    }
  };

  client.on('patch', dbPatch);
};

const init = (server, modules, accessControlFn) => {
  const io = require('socket.io')();
  io.listen(server)
    .on('connection', handleClientConnection(accessControlFn));
  modules.forEach(fn => fn(io));
  return io;
};

module.exports = init;
