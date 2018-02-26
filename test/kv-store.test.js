const getDbClient = require('../src/server/modules/get-db');
const { dbsOpened } = require('../src/server/key-value-store');

describe('db shared cache', () => {
  test('get', async () => {
    const {
      dbGlobalCache,
    } = require('../src/server/key-value-store/global-cache');

    dbGlobalCache.reset();

    const bucket = 'get_shared_cache';
    const db = await getDbClient(bucket);
    const value = { foo: 'bar' };
    await db.put('foo', { type: 'json', value });
    // trigger initial get
    const getResponse = await db.get('foo');
    expect(getResponse).toEqual(value);
    // trigger a cached `get`
    const cachedResponse = await db.get('foo');
    expect(cachedResponse).toEqual(value);

    // check that cache properly gets invalidated after a put
    const value2 = { foo2: 'bar2' };
    await db.put('foo', { type: 'json', value: value2 });
    const getResponse2 = await db.get('foo');
    expect(getResponse2).toEqual(value2);

    // before db drop
    expect(dbGlobalCache.keys().length).toBe(1);

    await db.put('foo2', { value: 'foo' });
    await db.get('foo2');

    // drop dbs
    const entries = dbsOpened.dump();
    await Promise.all(
      entries.map(({ v: db }) => {
        return db.then(db => db.drop());
      })
    );
  });
});
