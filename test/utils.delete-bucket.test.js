import getDbClient from '../src/server/modules/get-db';
import Stream from '../src/server/key-value-store/utils/stream';
import deleteBucket from '../src/server/key-value-store/utils/delete-bucket';

test('utils.delete-bucket', async () => {
  const db = await getDbClient('utils.delete-bucket');

  const bucket = 'bucket_to_delete';
  const mockValue = { value: 'v1', actionType: 'put' };
  await db.put({ bucket: bucket, key: 'key1' }, mockValue);
  await db.put({ bucket: bucket, key: 'key2' }, mockValue);

  const delCount = await deleteBucket(db, bucket, 1);
  expect(delCount).toBe(2);
  const onData = jest.fn();
  await Stream(db, { bucket }, onData);
  expect(onData.mock.calls.length).toBe(0);
});
