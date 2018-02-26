const regex = /^[.a-zA-Z0-9_-]+$/;

function RegexError(type, value) {
  this.message = `invalid ${type} name '${value}', expecting a key to match ${regex}`;
}

function TypeError(type, valueType, value) {
  this.message = `invalid ${type} '${value}' of type '${valueType}', expecting type 'string'`;
}

module.exports = {
  validateBucket: (bucket) => {
    const bucketType = typeof bucket;
    if (bucketType !== 'string') {
      throw new TypeError('bucket', bucketType, bucket);
    }
    if (!bucket.match(regex)) {
      throw new RegexError('bucket', bucket);
    }
    return true;
  },
  validateKey: (key) => {
    const keyType = typeof key;
    if (keyType !== 'string') {
      throw new TypeError('key', keyType, key);
    }
    if (!key.match(regex)) {
      throw new RegexError('key', key);
    }
    return true;
  },
  regex
};
