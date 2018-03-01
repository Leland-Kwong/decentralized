import dbGet from '../src/server/modules/db-get';
import dbPut from '../src/server/modules/db-put';
import getDbClient from '../src/server/modules/get-db';

test('socket.get', async () => {
  const storeName = 'socket.get.test';
  const db = await getDbClient(storeName);
  const value = { foo: 'bar' };
  const bucket = 'bucket';
  const key = 'key';

  // put an initial value to database
  await dbPut({ bucket, key, value, storeName });

  const fn = jest.fn();
  await dbGet({
    bucket,
    key,
    storeName
  }, fn);
  expect(fn.mock.calls.length).toBe(1);

  // stores value to database
  expect(await db.get({ bucket, key })).toEqual(value);
});
