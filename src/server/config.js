const crypto = require('crypto');
const bytes = require('bytes');
const path = require('path');

// NOTE: this prevents us from loading the '.env' file because of accidental deployment.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.development') });
}

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
  dbCacheSize: bytes('550MB'),
  dbBasePath: dbRoot[process.env.NODE_ENV],
  secret: crypto
    .createHash('md5')
    .update(secret)
    .digest('hex'),
  socketServerAdminApiKey: process.env.SOCKET_SERVER_ADMIN_API_KEY,
  socketClientDevAuthToken: process.env.SOCKET_CLIENT_DEV_AUTH_TOKEN
};
