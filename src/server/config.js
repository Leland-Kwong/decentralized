const crypto = require('crypto');
const bytes = require('bytes');
require('dotenv').config();

const dbRoot = {
  test: '/tmp/test/_data',
  bench: '/tmp/_bench',
  development: '/tmp/_data',
  production: '/tmp/_data'
};
const secret = process.env.NODE_ENV === 'test'
  ? 'secret'
  : process.env.SUPER_SECRET;
module.exports = {
  dbCacheSize: bytes('600MB'),
  dbBasePath: dbRoot[process.env.NODE_ENV],
  secret: crypto
    .createHash('md5')
    .update(secret)
    .digest('hex')
};
