import dbPut from '../src/server/modules/db-put';
import dbDel from '../src/server/modules/db-del';
import Stream from '../src/server/key-value-store/utils/stream';
import getDbClient from '../src/server/modules/get-db';

describe('socket.del', () => {
  const bucket = 'del.bucket';

  test('delete key', async () => {
    const storeName = 'socket.del.test.delete-key';
    const db = await getDbClient(storeName);
    const key = 'del.key';
    await dbPut(db)({ bucket, key, value: 'del' });
    const fn = jest.fn();
    await dbDel(db)({ bucket, key, storeName }, fn);
    expect(fn.mock.calls.length).toBe(1);
    expect(await db.get({ bucket, key })).toBe(null);
  });

  test('delete bucket', async () => {
    const storeName = 'socket.del.test.delete-bucket';
    const db = await getDbClient(storeName);
    await dbPut(db)({ bucket, key: 'k1', storeName, value: 'del' });
    await dbPut(db)({ bucket, key: 'k2', storeName, value: 'del' });
    const fn = jest.fn();
    await dbDel(db)({ bucket, storeName }, fn);
    expect(fn.mock.calls.length).toBe(1);

    const onData = jest.fn();
    await Stream(db, { bucket }, onData);
    expect(onData.mock.calls.length).toBe(0);
  });
});
