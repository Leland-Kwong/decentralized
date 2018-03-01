const getDbClient = require('../src/server/modules/get-db');
const { dbsOpened } = require('../src/server/key-value-store');
const Stream = require('../src/server/utils/stream');

afterAll(async () => {
  // drop dbs
  const entries = dbsOpened.dump();
  await Promise.all(
    entries.map(({ v: db }) => {
      return db.then(db => db.drop());
    })
  );
});

describe('key value store', () => {
  test('put, get, del', async () => {
    const {
      dbGlobalCache,
    } = require('../src/server/key-value-store/global-cache');

    dbGlobalCache.reset();

    const storeName = 'test';
    const bucket = 'shared.cache';
    const db = await getDbClient(storeName);
    const value1 = { foo: 'bar' };
    const key1 = { bucket, key: '/foo' };
    try {
      await db.putWithLog(key1, { type: 'json', value: value1, actionType: 'put' });
    } catch(err) {
      console.error(err);
      return;
    }

    // trigger initial get
    const getResponse = await db.get(key1);
    expect(getResponse).toEqual(value1);
    // trigger a cached `get`
    const cachedResponse = await db.get(key1);
    expect(cachedResponse).toEqual(value1);

    // check that cache properly gets invalidated after a put
    const value2 = { foo2: 'bar2' };
    await db.putWithLog(key1, { type: 'json', value: value2, actionType: 'put' });
    const getResponse2 = await db.get(key1);
    expect(getResponse2).toEqual(value2);

    // before db drop
    expect(dbGlobalCache.keys().length).toBe(1);

    const key2 = { bucket, key: 'foo2' };
    await db.putWithLog(key2, { value: 'foo', actionType: 'put' });
    await db.get(key2);
  });

  test('logging', async () => {
    const db = await getDbClient('log_test');
    const bucket = 'bucket';
    const key = 'key';
    const putKey = { bucket, key };
    const value = { value: 'bar', actionType: 'put' };
    await db.putWithLog(putKey, value);
    await db.delWithLog(putKey);

    const onData = jest.fn();
    const bucketOplog = '_opLog';
    await Stream(
      db,
      { bucket: bucketOplog },
      onData
    );
    expect(onData.mock.calls.length).toBe(2);
  });
});
