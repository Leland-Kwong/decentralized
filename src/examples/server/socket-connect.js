const SocketClient = require('../../isomorphic/socket-client');
const {
  socketServerAdminApiKey: serverAuthTokenApiKey,
} = require('../../server/config');

module.exports = () =>
  new SocketClient({
    uri: 'http://localhost:3000',
    token: serverAuthTokenApiKey,
    storeName: 'client'
  });
