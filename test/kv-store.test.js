import KV from '../src/server/key-value-store';

test('custom decoder', async () => {
  const db = await KV('/tmp', {
    encoding: {
      valueEncoding: {
        type: 'queryable',
        buffer: false,
        encode: data => data,
        decode: data => {
          return JSON.parse(data);
        }
      }
    }
  });

  const val = { foo: 'bar' };
  db.on('put', (k, v) => {
    expect(v).toEqual(val);
  });
  await db.put('json', JSON.stringify(val));

  await new Promise((resolve) => {
    const stream = db.createReadStream();
    stream.on('data', (data) => {
      expect(data.value).toEqual(val);
    });
    stream.on('end', resolve);
  });

  const getResult = await db.get('json');
  expect(getResult).toEqual(val);
  await db.close();
});
