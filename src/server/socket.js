// TODO: add syncing support. Syncing works by syncing the db files #mvp
// TODO: user permissions #mvp
// TODO: user management #enhancement
// TODO: add file upload support #enhancement
// TODO: add support for *key* filtering to `db.on`. Right now, each subscription function gets called whenever the database changes. #performance
// TODO: add support for server-side functions #enhancement
// TODO: batch writes to be 20ops/tick? #performance
// TODO: watch '_data' folder and close the database if folder gets deleted
const KV = require('./key-value-store');
const decodeData = require('./key-value-store/decode-data');
const Debug = require('debug');
const { AccessToken } = require('./login');
const shortid = require('shortid');
const queryData = require('./query-data');
const Now = require('performance-now');
const debug = {
  checkToken: Debug('evds.socket.checkToken'),
  patch: Debug('evds.db.patch')
};
const getTokenFromSocket = (socket) =>
  socket.handshake.query.token;

const io = require('socket.io')();
const normalizePut = (value) => {
  if (value && typeof value === 'object') {
    return ['json', JSON.stringify(value)];
  }
  return ['string', value];
};

const delim = {
  // value
  v: '\n\n'
};
// parses the value based on the data type
const parseGet = (data) => {
  const { headers, value } = decodeData(data);
  const type = headers[0];
  if (type === 'dbLog') {
    const [b, k, a] = headers.slice(1);
    return { b, k, a, v: value };
  }
  return type === 'json' ? JSON.parse(value) : value;
};

const { dbBasePath: dbRoot } = require('./config');
const path = require('path');
const dbBasePath = ({ bucket }) => path.join(dbRoot, bucket);
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

const dbStreamHandler = (keys, values, cb) => {
  if (keys && values) {
    return (data) => {
      data.value = parseGet(data.value);
      cb(data);
    };
  }
  if (!values) {
    return (key) => cb({ key });
  }
  if (!keys) {
    return (value) => cb({ value: parseGet(value) });
  }
};

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
  const dbSubscribe = async ({
    bucket,
    key = '',
    limit = -1,
    gt,
    lt,
    gte,
    lte,
    reverse = false,
    keys = true,
    values = true,
    initialValue = true,
    // If true, we will not subscribe to db changes, but instead stream out
    // the results and then emit a { done: 1 } frame. This allows the client to
    // do things like `forEach` once.
    once = false
  }, callback) => {
    // a unique eventId for each subscription
    const eventId = shortid.generate();
    callback(eventId);

    const db = await KV(dbBasePath({ bucket }));
    const keyToSubscribe = key;
    const watchEntireBucket = key === '';

    // watch entire bucket
    if (watchEntireBucket) {
      function bucketStream() {
        const options = { limit, reverse, keys, values, gt, lt, gte, lte };
        const stream = db.createReadStream(options);
        const onDataCallback = (data) => client.emit(eventId, data);
        stream.on('data', dbStreamHandler(keys, values, onDataCallback));
        stream.on('error', (error) => {
          client.emit(eventId, { error: error.message });
        });
        if (once) {
          stream.on('end', () => client.emit(eventId, { done: 1 }));
        }
      }

      if (initialValue) {
        bucketStream();
      }

      if (once) {
        return;
      }

      db.on('put', bucketStream);
      db.on('del', bucketStream);
    } else {
      try {
        if (initialValue) {
          // emit initial value
          const currentValue = await db.get(key);
          client.emit(eventId, { value: parseGet(currentValue) });
        }

        // setup subscription
        const putCb = async (key, value) => {
          const ignore = !watchEntireBucket && key !== keyToSubscribe;
          if (ignore) return;
          client.emit(eventId, { action: 'put', key, value: parseGet(value) });
        };
        const delCb = async (key) => {
          const ignore = !watchEntireBucket && key !== keyToSubscribe;
          if (ignore) return;
          client.emit(eventId, { action: 'del', key });
        };
        subscriptions.set(eventId, function cleanup() {
          db.removeListener('put', putCb);
          db.removeListener('del', delCb);
        });
        db.on('put', putCb);
        db.on('del', delCb);
      } catch(err) {
        if (err.type === 'NotFoundError') {
          return;
        }
        require('debug')('db.subscribe')(err);
        client.emit(eventId, { error: err.message });
      }
    }
  };

  client.on('subscribe', dbSubscribe);
  // subscribe to entire bucket
  client.on('subscribeBucket', (params, callback) => {
    dbSubscribe(params, callback);
  });

  async function dbGet ({ bucket, key, query }, fn) {
    try {
      const db = await KV(dbBasePath({ bucket }));
      const value = parseGet(await db.get(key));
      fn({ value: queryData(query, value) });
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

  async function dbPut(data, fn) {
    const {
      bucket,
      key,
      value,
      patch
    } = data;
    const db = await KV(dbBasePath({ bucket }));
    const [type, normalizedValue] = normalizePut(value);

    const putValue = `${type}${delim.v}${normalizedValue}`;
    const logValue = patch ? `${type}${delim.v}${patch}` : putValue;
    const actionType = patch ? 'patch' : 'put';
    dbLog.addEntry({ bucket, key, actionType, value: logValue });
    try {
      await db.put(key, putValue);
      fn && fn({});
    } catch(err) {
      require('debug')('db.put')(err);
      fn({ error: err.message });
    }
  }
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
