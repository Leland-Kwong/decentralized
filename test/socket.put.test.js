import dbPut from '../src/server/modules/db-put';
import getDbClient from '../src/server/modules/get-db';
import dbNsEvent from '../src/server/modules/db-ns-event';

test('socket.put', async () => {
  const storeName = 'socket.put.test';
  const db = await getDbClient(storeName);
  const value = { foo: 'bar' };
  const bucket = 'bucket';
  const key = 'key';

  // triggers namespace event
  const event = dbNsEvent('put', bucket, key);
  const fn1 = jest.fn();
  db.on(event, fn1);

  const fn2 = jest.fn();
  await dbPut({
    bucket,
    key,
    value,
    storeName
  }, fn2);
  expect(fn1.mock.calls.length).toBe(1);
  expect(fn2.mock.calls.length).toBe(1);

  // stores value to database
  expect(await db.get({ bucket, key })).toEqual(value);
});
