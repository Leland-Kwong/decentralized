// TODO: add support for server-side functions
// TODO: batch writes to be 20ops/ms ?
// TODO: watch '_data' folder and close the database if folder gets deleted
const KV = require('./key-value-store');
const parseData = require('./key-value-store/parse-data');
const Debug = require('debug');
const { AccessToken } = require('./login');
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
const dbLog = {
  async addEntry({ bucket, key, actionType, value = '' }) {
    const db = await KV(dbBasePath({ bucket: '_log' }));
    const uid = `${new Date().getTime()}_${process.hrtime().join('.').substr(0, 14)}`;
    db.put(uid, `dbLog\n${bucket}\n${key}\n${actionType}${delim.v}${value}`);
  },
};
const getKey = (bucket, key) => {
  return `${bucket}${key ? '/' + key : ''}`;
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
    reverse = false }) => {

    const subKey = getKey(bucket, key);
    if (subscriptions.has(subKey)) {
      return;
    }
    const db = await KV(dbBasePath({ bucket }));
    const keyToSubscribe = key;
    const watchEntireBucket = key === '';
    const onDbChangeCallback = action => async (key, value) => {
      if (
        !watchEntireBucket
        && key !== keyToSubscribe
      ) {
        return;
      }
      client.emit(subKey, { ok: 1, action, key, value: normalizeGet(value) });
    };
    const putCb = onDbChangeCallback('put');
    const delCb = onDbChangeCallback('del');
    subscriptions.set(subKey, () => {
      db.removeListener('put', putCb);
      db.removeListener('del', delCb);
    });
    db.on('put', putCb);
    db.on('del', delCb);

    // watch entire bucket
    if (watchEntireBucket) {
      const options = { limit, reverse };
      const stream = db.createReadStream(options);
      stream.on('data', ({ key, value }) => {
        client.emit(bucket, { ok: 1, key, value: normalizeGet(value) });
      });
      stream.on('error', (error) => {
        client.emit(bucket, { ok: 0, error: error.message });
      });
    } else {
      try {
        const currentValue = await db.get(key);
        client.emit(subKey, { ok: 1, value: normalizeGet(currentValue) });
      } catch(err) {
        if (err.type === 'NotFoundError') {
          return;
        }
        require('debug')('db.subscribe')(err);
        client.emit(subKey, { ok: 0, error: err.message });
      }
    }
  };
  client.on('sub', subscribe);
  // subscribe to entire bucket
  client.on('forEach', (params) => {
    subscribe(params);
  });

  client.on('get', async ({ bucket, key }, fn) => {
    try {
      const db = await KV(dbBasePath({ bucket }));
      const value = await db.get(key);
      fn({ ok: 1, value: normalizeGet(value) });
    } catch(err) {
      if (err.type === 'NotFoundError') {
        fn({ ok: 1, value: null });
        return;
      }
      require('debug')('db.get')(err);
      fn({ ok: 0, error: err });
    }
  });

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
      fn({ ok: 1 });
    } catch(err) {
      require('debug')('db.delete')(err);
      fn({ ok: 0, error: err });
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
      fn({ ok: 1 });
    } catch(err) {
      require('debug')('db.get')(err);
      fn({ ok: 0, error: err.message });
    }
  });
});

module.exports = (server) => {
  io.listen(server);
};
