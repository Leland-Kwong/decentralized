const {
  socketServerAdminApiKey: serverAuthTokenApiKey,
} = require('../../server/config');
const {
  devToken: socketClientDevAuthToken
} = require('../../public/client/config');
const App = require('../../server');
const Token = require('../../server/login/token');
const backup = require('./cloud-backup');
const AccessToken = Token({ storeName: 'client' });
const { CronJob } = require('cron');
const connectSocket = require('../socket-connect');
// const Now = require('performance-now');

const connection = connectSocket();

const app = new App();
const isProduction = process.env.NODE_ENV === 'production';

const tick = async () => {
  connection.socket
    .on('error', (err) => console.error(err));

  try {
    const currentCount = await connection
      .bucket('ticker')
      .key('count')
      .get();
    let count = currentCount;
    let id = null;
    const intervalError = error => {
      clearInterval(id);
      console.error(error);
    };
    id = setInterval(() => {
      connection
        .bucket('ticker')
        .key('count')
        .put(count++)
        .catch(intervalError);
    }, 100);
  } catch(err) {
    console.error('TICK ERROR:', err);
  }
};

const getTokenFromSocket = (socket) =>
  socket.handshake.query.token;

const accessControl = async (event, args, client, next) => {
  const tokenId = getTokenFromSocket(client);

  // TODO: add tests for different environments to make sure this works properly. #mvp
  const authBypass = !isProduction && (
    socketClientDevAuthToken &&
      (tokenId === socketClientDevAuthToken)
  );
  if (authBypass) {
    return next();
  }

  if (serverAuthTokenApiKey &&
      (tokenId === serverAuthTokenApiKey)
  ) {
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

const scheduleBackup = () => {
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
if (isProduction) {
  scheduleBackup('lucidbyte_backup', '/tmp/_data');
}
