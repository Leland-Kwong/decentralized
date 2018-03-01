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
  token: serverAuthTokenApiKey
});

const tick = () => {
  connection.socket
    .on('connect', () => {
      console.log('server socket connected!');
    })
    .on('error', (err) => console.error(err));

  let count = 0;
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
};

const getTokenFromSocket = (socket) =>
  socket.handshake.query.token;

const sessionCheck = async (client, next) => {
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

const accessControl = (event, args, client, next) => {
  return sessionCheck(client, next);
};

app
  .dbAccessControl(accessControl)
  // .use(tick)
  .start()
  .on('connect', tick);
