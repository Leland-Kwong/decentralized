const regex = /^[.a-zA-Z0-9_-]+$/;

function RegexError(type, value) {
  this.message = `invalid ${type} name '${value}', ${type} should match ${regex}`;
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
  regex
};
