// TODO: user permissions #mvp
// TODO: add syncing support. Syncing works by syncing the db files #mvp
// TODO: add request throttling
// TODO: user management #enhancement
// TODO: add file upload support #enhancement
const getDbClient = require('./modules/get-db');
const { putWithLog } = require('./key-value-store');
const Debug = require('debug');
const debug = {
  checkToken: Debug('evds.socket.checkToken'),
  patch: Debug('evds.db.patch'),
  stream: Debug('evds.db.stream')
};

const addSubscription = require('./modules/subscribe-fn.js');

const handleClientConnection = (dbAccessControl, db) => (client) => {
  require('debug')('evds.server.start.pid')(process.pid);
  // require('debug')('evds.connect')(client.handshake);

  client.use(function checkAccess(packet, next) {
    if (dbAccessControl) {
      const [event, args] = packet;
      return dbAccessControl(event, args, client, next);
    }
    const msg = 'Access control function missing. For security reasons, an'
    + 'access control function must be provided.';
    next(new Error(msg));
  });

  const dbSubscriptions = new Map();

  const onSubscribe = (params, callback) => {
    addSubscription(params, callback, client, db, dbSubscriptions);
  };
  client.on('subscribe', onSubscribe);
  client.on('subscribeBucket', onSubscribe);

  const dbGet = require('./modules/db-get')(db);
  client.on('get', dbGet);

  const dbDel = require('./modules/db-del')(db);
  client.on('delete', dbDel);

  const dbPut = require('./modules/db-put')(db);
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
      await putWithLog(db, nsKey, putValue);
      fn({});
    } catch(err) {
      debug.patch(err);
      fn({ error: err.message });
    }
  };

  client.on('patch', dbPatch);

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
};

const init = (server, modules, accessControlFn) => {
  const io = require('socket.io')();
  io.listen(server)
    .on('connection', async (client) => {
      let db;
      try {
        db = await getDbClient(client.handshake.query.storeName);
        handleClientConnection(accessControlFn, db)(client);
      } catch(err) {
        console.error(err);
      }
    });
  return io;
};

module.exports = init;
