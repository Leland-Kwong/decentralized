const connectSocket = require('../socket-connect');
const connection = connectSocket();

function getLogCount () {
  const options = {
    // once: true,
    // values: false,
    limit: 1,
    reverse: true
  };
  // const Now = require('performance-now');
  // const start = Now();
  const $oplog = connection
    .bucket('_opLog')
    .filter(options);

  $oplog.subscribe(
    data => console.log(data),
    (error) => console.error(error),
    () => console.log('done')
  );

}
getLogCount();
