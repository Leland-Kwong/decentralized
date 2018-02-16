// TODO: batch writes to be 20ops/ms ?
// TODO: watch '_data' folder and close the database if folder gets deleted
const KV = require('./key-value-store');

const express = require('express');
const server = express();
const serverPort = 3000;
server.listen(serverPort);

const socketPort = 3001;
const io = require('socket.io')();
const normalizePut = (value) => {
  if (value && typeof value === 'object') {
    return ['json', JSON.stringify(value)];
  }
  return ['string', value];
};
const normalizeGet = (data) => {
  const [type, ...rest] = data.split('\n');
  if (type === 'dbLog') {
    const [b, k, t, v] = rest;
    return { b, k, t, v };
  }
  return type === 'json' ? JSON.parse(rest[0]) : rest[0];
};
const dbBasePath = ({ bucket }) => `${process.cwd()}/_data/${bucket}`;
const dbLog = {
  async addEntry({ bucket, key, type, value = '' }) {
    const db = await KV(dbBasePath({ bucket: '_log' }));
    const uid = `${new Date().getTime()}_${process.hrtime().join('.').substr(0, 14)}`;
    db.put(uid, `dbLog\n${bucket}\n${key}\n${type}\n${value}`);
  }
};
io.on('connection', (client) => {
  const subscriptions = new Map();
  const subscribe = async ({ bucket, key = '' }) => {
    const subKey = `${bucket}${key ? '/' + key : ''}`;
    if (subscriptions.has(subKey)) {
      return;
    }
    const db = await KV(dbBasePath({ bucket }));
    const keyToSubscribe = key;
    const watchEntireBucket = key === '';
    const onDbChangeCallback = (key, value) => {
      if (
        !watchEntireBucket
        && key !== keyToSubscribe
      ) {
        return;
      }

      io.emit(subKey, { ok: 1, key, value: normalizeGet(value) });
    };
    subscriptions.set(subKey, () => {
      db.removeListener('put', onDbChangeCallback);
    });
    db.on('put', onDbChangeCallback);

    // watch entire bucket
    if (!key) {
      const stream = db.createReadStream();
      stream.on('data', ({ key, value }) => {
        io.emit(bucket, { ok: 1, key, value: normalizeGet(value) });
      });
      stream.on('error', (error) => {
        io.emit(bucket, { ok: 0, error: error.message });
      });
    } else {
      try {
        const currentValue = await db.get(key);
        io.emit(subKey, { ok: 1, value: normalizeGet(currentValue) });
      } catch(err) {
        if (err.type === 'NotFoundError') {
          return;
        }
        require('debug')('db.subscribe')(err);
        io.emit(subKey, { ok: 0, error: err.message });
      }
    }
  };
  client.on('sub', subscribe);
  // subscribe to entire bucket
  client.on('forEach', async({ bucket }) => {
    subscribe({ bucket });
  });

  client.on('get', async ({ bucket, key }) => {
    const subKey = `${bucket}/${key}`;
    try {
      const db = await KV(dbBasePath({ bucket }));
      const value = await db.get(key);
      io.emit(subKey, { ok: 1, value: normalizeGet(value) });
    } catch(err) {
      if (err.type === 'NotFoundError') {
        io.emit(subKey, { ok: 1, value: null });
        return;
      }
      require('debug')('db.get')(err);
      io.emit(subKey, { ok: 0, error: err });
    }
  });

  client.on('delete', async ({ bucket, key }) => {
    const subKey = `${bucket}/${key}`;
    const db = await KV(dbBasePath({ bucket }));
    dbLog.addEntry({ bucket, key, type: 'delete' });
    try {
      await db.del(key);
      io.emit(subKey, { ok: 1 });
    } catch(err) {
      require('debug')('db.delete')(err);
      io.emit(subKey, { ok: 0, error: err });
    }
  });

  // cleanup subscriptions
  client.on('disconnect', () => {
    [...subscriptions].forEach(([, cleanup]) => {
      cleanup();
    });
  });

  client.on('put', async (data) => {
    const {
      bucket,
      key,
      value
    } = data;
    const db = await KV(dbBasePath({ bucket }));
    const [type, normalizedValue] = normalizePut(value);
    dbLog.addEntry({ bucket, key, type: 'put', value: normalizedValue });
    try {
      await db.put(key, `${type}\n${normalizedValue}`);
    } catch(err) {
      require('debug')('db.get')(err);
    }
  });
});
io.listen(socketPort);
