const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const { encodeData, decodeData } = require('../key-value-store/codecs');
const { validateBucket } = require('../modules/validate-db-paths');

const bucketKeyDelim = '/';
const isProduction = process.env.NODE_ENV === 'production';
const encoding = {
  /*
    Buckets have a string requirement of only basic characters as defined in
    `validateBucket` method. Keys can be any character since we delimit the bucket
    based on the first '/' character.
   */
  keyEncoding: {
    type: 'multi',
    buffer: false,
    encode: input => {
      const isPlainObject = input && 'object' === typeof input;
      if (!isPlainObject) {
        return input;
      }
      else if (
        !isProduction &&
        !('bucket' in input) &&
        !('key' in input)
      ) {
        throw `key must be an object of { bucket: String, key: String }, received '${input}'`;
      }
      const { bucket, key } = input;
      validateBucket(bucket);
      return bucket + bucketKeyDelim + key;
    },
    decode: output => {
      const delim = bucketKeyDelim;
      const delimIndex = output.indexOf(delim);
      const bucket = output.slice(0, delimIndex);
      const key = output.slice(delimIndex + 1);
      return { bucket, key };
    }
  },
  valueEncoding: {
    type: 'multi',
    buffer: false,
    encode: encodeData,
    decode: decodeData
  }
};

// databases used for api calls from client
const dbFactory = KV(dbBasePath);

module.exports = (storeName) => {
  const config = {
    storeName,
    encoding,
  };
  return dbFactory(config);
};
