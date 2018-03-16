const isServer = require('../../isomorphic/is-server');
const productionApiBaseRoute = `https://todos.lelandkwong.com`;

let isDev;

if (!isServer) {
  isDev = module.exports.isDev = location.hostname === 'localhost2';
  module.exports.serverApiBaseRoute = isDev
    ? `http://${location.hostname}:3009`
    : productionApiBaseRoute;
}

const devToken = module.exports.devToken
  = '6285db0b82e7b141b866bde7';

if (isDev && !isServer) {
  const session = require('./session');
  session.set({ accessToken: devToken });
}
