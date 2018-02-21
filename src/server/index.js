const express = require('express');
const app = express();
const bodyParser = require('body-parser');

app.use(bodyParser.json({ limit: '50KB' }));
const server = require('http').createServer(app);
server.listen(3000);

require('./rest')(app);
require('./socket')(server);

const memwatch = require('memwatch-next');
memwatch.on('leak', (info) => {
  console.error('Memory leak detected:\n', info);
});
