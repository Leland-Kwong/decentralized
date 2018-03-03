const express = require('express');
const bodyParser = require('body-parser');

const memwatch = require('memwatch-next');
memwatch.on('leak', (info) => {
  console.error('Memory leak detected:\n', info);
});

class App {
  constructor(options = {}) {
    this.options = options;
    this.modules = [];
  }

  // Permission function to control database access. Gets called for every
  // request to the database
  dbAccessControl(fn) {
    this.dbAccessControlFn = fn;
    return this;
  }

  start() {
    const {
      port = 3000,
    } = this.options;

    const app = express();
    app.use(bodyParser.json({ limit: '10MB' }));
    const server = require('http').createServer(app);
    // setup express server
    require('./routes')(app);
    // setup socket server
    require('./socket')(
      server,
      this.modules,
      this.dbAccessControlFn
    );

    server.listen(port, function(err) {
      if (err) console.error(err);
      app.emit('connect');
    });
    return app;
  }
}

module.exports = App;
