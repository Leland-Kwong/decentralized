const onDataKeysAndValues = (callback, stream) =>
  (data) => callback(data, stream);
const onDataKeysOnly = (callback, stream) =>
  (data) => callback({ key: data }, stream);
const onDataValuesOnly = (callback, stream) =>
  (data) => callback({ value: data }, stream);

module.exports = async function Stream(db, options, onData) {
  let { gt, gte, lt, lte } = (onData ? options : onData) || {};
  const {
    bucket, reverse = false, keys = true, values = true, limit = -1
  } = options;

  if (typeof gt !== 'undefined') {
    gt = { bucket, key: gt };
  }
  else if (typeof gte !== 'undefined') {
    gte = { bucket, key: gte };
  }
  else {
    gte = { bucket, key: '' };
  }

  // the `~` character has a high char code, so its good for range filtering
  if (typeof lt !== 'undefined') {
    lt = { bucket, key: lt + '~' };
  }
  else if (typeof lte !== 'undefined') {
    lte = { bucket, key: lte + '~' };
  }
  else {
    lte = { bucket, key: '~' };
  }

  const newOptions = { bucket, gt, gte, lt, lte, reverse, keys, values, limit };
  const stream = db.createReadStream(newOptions);
  const onDataCallback = onData || options;
  let _onData;
  if (keys && values) {
    _onData = onDataKeysAndValues(onDataCallback, stream);
  } else if (!values) {
    _onData = onDataKeysOnly(onDataCallback, stream);
  } else {
    _onData = onDataValuesOnly(onDataCallback, stream);
  }
  return new Promise((resolve, reject) => {
    stream
      .on('data', _onData)
      .on('error', reject)
      .on('end', resolve)
      .on('close', resolve);
  });
};
