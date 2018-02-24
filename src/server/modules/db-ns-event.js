module.exports = (event, bucket, key) =>
  `${event}.${bucket}/${key}`;
