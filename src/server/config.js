const crypto = require('crypto');
require('dotenv').config();

const dbRoot = '/tmp/_data';
const secret = process.env.NODE_ENV === 'test'
  ? 'secret'
  : process.env.SUPER_SECRET;
module.exports = {
  dbBasePath: dbRoot,
  secret: crypto
    .createHash('md5')
    .update(secret)
    .digest('hex')
};
