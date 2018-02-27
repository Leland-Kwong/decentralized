const express = require('express');
const app = express();
const bodyParser = require('body-parser');

module.exports = function startServer(options = {}) {
  const {
    port = 3000,
    modules = []
  } = options;

  app.use(bodyParser.json({ limit: '50KB' }));
  const server = require('http').createServer(app);
  server.listen(port);

  require('./rest')(app);
  require('./socket')(server, modules);

  const memwatch = require('memwatch-next');
  memwatch.on('leak', (info) => {
    console.error('Memory leak detected:\n', info);
  });
};
