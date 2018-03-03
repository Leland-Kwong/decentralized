const App = require('../server/index');
const SocketClient = require('../isomorphic/socket-client');
const {
  socketServerAdminApiKey: serverAuthTokenApiKey,
  socketClientDevAuthToken
} = require('../server/config');
const Token = require('../server/login/token');
const AccessToken = Token({ storeName: 'client' });

const app = new App();

const connection = new SocketClient({
  uri: 'http://localhost:3000',
  token: serverAuthTokenApiKey,
  storeName: 'client'
});

const tick = async () => {
  connection.socket
    .on('connect', () => {
      console.log('server socket connected!');
    })
    .on('error', (err) => console.error(err));

  try {
    const currentCount = await connection
      .bucket('ticker')
      .key('count')
      .get();
    let count = currentCount;
    const id = setInterval(() => {
      connection.put({
        bucket: 'ticker',
        key: 'count',
        value: count++
      }).catch(error => {
        clearInterval(id);
        console.error(error);
      });
    }, 1000);
  } catch(err) {
    console.error('TICK ERROR:', err);
  }
};

const getTokenFromSocket = (socket) =>
  socket.handshake.query.token;

const accessControl = async (event, args, client, next) => {
  const tokenId = getTokenFromSocket(client);

  const authBypass = tokenId === serverAuthTokenApiKey
    || tokenId === socketClientDevAuthToken;
  if (authBypass) {
    return next();
  }

  try {
    await AccessToken.verify(tokenId);
    next();
  }
  catch(error) {
    console.log(error);
    return next(new Error(error.message));
  }
};

app
  .dbAccessControl(accessControl)
  .start();

tick();
