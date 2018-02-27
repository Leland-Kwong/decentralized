const startServer = require('../server/index');

const tick = () => {
  const socket = require('socket.io-client');
  const connection = socket('http://localhost:3000', {
    query: {
      token: 'd98d51cebedfb4c7d8c2a74a'
    }
  });

  let count = 0;
  // setInterval(() => {
  //   connection.emit('put', {
  //     bucket: 'ticker',
  //     key: 'count',
  //     value: count++
  //   });
  // }, 1000);
};

startServer({
  modules: [tick]
});
