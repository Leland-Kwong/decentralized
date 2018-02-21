const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const dbRoot = '/tmp/_data';
module.exports = {
  dbBasePath: ({ bucket }) => path.join(dbRoot, bucket),
  secret: crypto
    .createHash('md5')
    .update(process.env.SUPER_SECRET)
    .digest('hex')
};
