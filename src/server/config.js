const crypto = require('crypto');
const bytes = require('bytes');
require('dotenv').config();

const dbRoot = '/tmp/_data';
const secret = process.env.NODE_ENV === 'test'
  ? 'secret'
  : process.env.SUPER_SECRET;
module.exports = {
  dbCacheSize: bytes('600MB'),
  dbBasePath: dbRoot,
  secret: crypto
    .createHash('md5')
    .update(secret)
    .digest('hex')
};
