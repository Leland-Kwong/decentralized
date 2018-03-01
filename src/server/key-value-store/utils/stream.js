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
  const _onData = onData || options;
  const stream = db.createReadStream(newOptions);
  return new Promise((resolve, reject) => {
    stream.on('data', (data) => {
      let response;
      // NOTE: if keys or values is omitted, the data parameter isn't an object
      // so this is a workaround to make it always respond with an object
      if (keys && values) {
        response = data;
      } else if (!values) {
        response = { key: data };
      } else {
        response = { value: data };
      }
      _onData(response, stream);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.on('close', resolve);
  });
};
