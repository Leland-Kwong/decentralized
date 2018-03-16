const SocketClient = require('../isomorphic/socket-client');
const {
  socketServerAdminApiKey: serverAuthTokenApiKey,
} = require('../server/config');

const { PORT } = process.env;
if (!PORT) {
  throw `PORT environment variable must be defined`;
}
module.exports = () =>
  new SocketClient({
    uri: `http://localhost:${PORT}`,
    token: serverAuthTokenApiKey,
    storeName: 'client'
  });
