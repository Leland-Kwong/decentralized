const crypto = require('crypto');
require('dotenv').config();

module.exports = {
  dbBasePath: '/tmp/_data',
  secret: crypto
    .createHash('md5')
    .update(process.env.SUPER_SECRET)
    .digest('hex')
};
