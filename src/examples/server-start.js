const startServer = require('../server/index');
const SocketClient = require('../isomorphic/socket-client');
const { socketServerApiKey: devToken } = require('../server/config');

// const connection = new SocketClient({
//   uri: 'http://localhost:3000',
//   token: devToken
// });
//
// const tick = () => {
//   connection.socket
//     .on('connect', () => {
//       console.log('server socket connected!');
//     })
//     .on('error', (err) => console.error(err));
//
//   let count = 0;
//   setInterval(() => {
//     connection.put({
//       bucket: 'ticker',
//       key: 'count',
//       value: count++
//     }).catch(console.error);
//   }, 1000);
// };

startServer({
  modules: [
    // tick
  ]
});
