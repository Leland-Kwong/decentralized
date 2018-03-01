module.exports = (event, bucket, key) => {
  if (key) {
    return `${event}.${bucket}/${key}`;
  }
  return `${event}.${bucket}`;
};
