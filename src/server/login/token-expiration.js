const ms = require('ms');
const expiresIn = '24h'; // [format reference](https://github.com/zeit/ms)
const expirationTimeUnix = (durationMs) => new Date().getTime() + ms(durationMs);

module.exports = {
  expiresIn,
  expirationTimeUnix
};
