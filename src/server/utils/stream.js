module.exports = async function Stream(db, options, onData) {
  const { gt, gte, lt, lte, bucket } = (onData ? options : onData) || {};
  if (typeof gt !== 'undefined') {
    options.gt = { bucket, key: gt };
  }
  else if (typeof gte !== 'undefined') {
    options.gte = { bucket, key: gte };
  }
  else {
    options.gte = { bucket, key: '' };
  }

  if (typeof lt !== 'undefined') {
    options.lt = { bucket, key: lt + '~' };
  }
  else if (typeof lte !== 'undefined') {
    options.lte = { bucket, key: lte + '~' };
  }
  else {
    options.lte = { bucket, key: '~' };
  }

  const stream = db.createReadStream(options);
  const _onData = onData || options;
  return new Promise((resolve, reject) => {
    stream.on('data', _onData);
    stream.on('error', reject);
    stream.on('end', resolve);
  });
};
