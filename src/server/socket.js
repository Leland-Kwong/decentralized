// TODO: add support for server-side functions
// TODO: batch writes to be 20ops/tick?
// TODO: watch '_data' folder and close the database if folder gets deleted
const KV = require('./key-value-store');
const parseData = require('./key-value-store/parse-data');
const Debug = require('debug');
const { AccessToken } = require('./login');
const shortid = require('shortid');
const Now = require('performance-now');
const debug = {
  checkToken: Debug('evds.socket.checkToken')
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
const normalizeGet = (data) => {
  const { headers, value } = parseData(data);
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
const logIdSeed = shortid.generate();
const dbLog = {
  async addEntry({ bucket, key, actionType, value = '' }) {
    const db = await KV(dbBasePath({ bucket: '_log' }));
    // current time in microseconds. (source)[https://stackoverflow.com/questions/11725691/how-to-get-a-microtime-in-node-js]
    const uid = (Date.now() + Now()) * 10000 + '_' + logIdSeed;
    db.put(uid, `dbLog\n${bucket}\n${key}\n${actionType}${delim.v}${value}`);
  },
};

const dbStreamHandler = (keys, values, cb) => {
  if (keys && values) {
    return (data) => cb(data);
  }
  if (!values) {
    return (key) => cb({ key });
  }
  if (!keys) {
    return (value) => cb({ value });
  }
};

io.on('connection', (client) => {
  require('debug')('evds.connect')(client);
  client.use(async function checkToken(_, next) {
    const token = getTokenFromSocket(client);
    const { ok, data } = await AccessToken.verify(token);
    if (!ok) {
      debug.checkToken(token);
      client.emit(data.type, data.message);
      return next();
    }
    next();
  });

  const subscriptions = new Map();
  const subscribe = async ({
    bucket,
    key = '',
    limit = -1,
    reverse = false,
    keys = true,
    values = true,
    initialValue = true
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
        const options = { limit, reverse, keys, values };
        const stream = db.createReadStream(options);
        const onDataCallback = (data) => client.emit(eventId, data);
        stream.on('data', dbStreamHandler(keys, values, onDataCallback));
        stream.on('error', (error) => {
          client.emit(eventId, { error: error.message });
        });
      }

      if (initialValue) {
        bucketStream();
      }

      db.on('put', bucketStream);
      db.on('del', bucketStream);
    } else {
      try {
        if (initialValue) {
          // emit initial value
          const currentValue = await db.get(key);
          client.emit(eventId, { value: normalizeGet(currentValue) });
        }

        // setup subscription
        const putCb = async (key, value) => {
          const ignore = !watchEntireBucket && key !== keyToSubscribe;
          if (ignore) return;
          client.emit(eventId, { action: 'put', key, value: normalizeGet(value) });
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

  client.on('sub', subscribe);
  // subscribe to entire bucket
  client.on('forEach', (params, callback) => {
    subscribe(params, callback);
  });

  async function handleGet ({ bucket, key }, fn) {
    try {
      const db = await KV(dbBasePath({ bucket }));
      const value = await db.get(key);
      fn({ value: normalizeGet(value) });
    } catch(err) {
      if (err.type === 'NotFoundError') {
        fn({ value: null });
        return;
      }
      require('debug')('db.get')(err);
      fn({ error: err });
    }
  }
  client.on('get', handleGet);

  client.on('delete', async ({ bucket, key }, fn) => {
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
  });

  // cleanup subscriptions
  client.on('disconnect', async () => {
    [...subscriptions].forEach(([, cleanup]) => {
      cleanup();
    });
  });

  client.on('put', async (data, fn) => {
    const {
      bucket,
      key,
      value
    } = data;
    const db = await KV(dbBasePath({ bucket }));
    const [type, normalizedValue] = normalizePut(value);

    let exists = false;
    try {
      exists = await db.hasKey(key);
    } catch(err) {
      require('debug')('db.hasKey')(err);
    }
    const actionType = exists ? 'put' : 'insert';
    const putValue = `${type}${delim.v}${normalizedValue}`;
    dbLog.addEntry({ bucket, key, actionType, value: putValue });
    try {
      await db.put(key, putValue);
      fn({});
    } catch(err) {
      require('debug')('db.get')(err);
      fn({ error: err.message });
    }
  });
});

module.exports = (server) => {
  io.listen(server);
};
