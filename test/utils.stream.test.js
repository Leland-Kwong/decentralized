import Stream from '../src/server/key-value-store/utils/stream';
import getDbClient from '../src/server/modules/get-db';

test('utils.stream', async () => {
  const db = await getDbClient('utils.stream');

  const bucket1 = 'stream.test.1';
  const mockValue = { value: 'v1', actionType: 'put' };
  await db.put({ bucket: bucket1, key: 'key1' }, mockValue);
  await db.put({ bucket: bucket1, key: 'key2' }, mockValue);
  await db.put({ bucket: bucket1, key: 'key3' }, mockValue);

  // add another bucket to see if it throws things off
  const bucket2 = 'stream.test.2';
  await db.put({ bucket: bucket2, key: 'key1' }, mockValue);

  // get all from bucket
  const onData = jest.fn();
  await Stream(db, { bucket: bucket1 }, onData);
  expect(onData.mock.calls.length).toBe(3);

  const onDataOnekey = jest.fn();
  await Stream(db, { bucket: bucket1, gte: 'key2', lte: 'key2' }, onDataOnekey);
  expect(onDataOnekey.mock.calls.length).toBe(1);

  const onDataOnlyKeys = jest.fn();
  await Stream(
    db,
    { values: false, bucket: bucket1, gte: 'key2', lte: 'key2' },
    onDataOnlyKeys
  );
  expect(onDataOnlyKeys.mock.calls[0])
    .toEqual([{ bucket: bucket1, key: 'key2' }]);
});
