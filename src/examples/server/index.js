const App = require('../../server');
const SocketClient = require('../../isomorphic/socket-client');
const {
  socketServerAdminApiKey: serverAuthTokenApiKey,
  socketClientDevAuthToken
} = require('../../server/config');
const Token = require('../../server/login/token');
const backup = require('./cloud-backup');
const AccessToken = Token({ storeName: 'client' });
const { CronJob } = require('cron');

const app = new App();

const connection = new SocketClient({
  uri: 'http://localhost:3000',
  token: serverAuthTokenApiKey,
  storeName: 'client'
});

const tick = async () => {
  connection.socket
    .on('connect', async () => {
      console.log('server socket connected!');

      const getDbClient = require('../../server/modules/get-db');
      const Stream = require('../../server/key-value-store/utils/stream');
      const db = await getDbClient('client');
      const options = {
        bucket: '_opLog',
        once: true,
        values: false,
        // limit: 1000
      };
      let logCount = 0;

      await Stream(db, options, () => logCount++);
      console.log(logCount);
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

const autoBackup = () => {
  // 11:30pm everyday
  const schedule = '00 30 23 * * 0-7';
  const job = new CronJob({
    cronTime: schedule,
    onTick: function() {
      backup()
        .then(({ data, took }) => {
          console.log('[AWS-S3 BACKUP SUCCESS]:', { data, took });
        })
        .catch(err => console.error('[AWS-S3 BACKUP ERROR]', err));
    }, function () {
      /* This function is executed when the job stops */
    },
    start: true, /* Start the job right now */
    timeZone: 'America/Los_Angeles' /* Time zone of this job. */
  });
  job.start();
};

app
  .dbAccessControl(accessControl)
  .start();

tick();
autoBackup();
