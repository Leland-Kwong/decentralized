const connectSocket = require('./socket-connect');
const connection = connectSocket();

function getLogCount () {
  const options = {
    bucket: '_opLog',
    // once: true,
    // values: false,
    limit: 1,
    reverse: true
  };
  // const Now = require('performance-now');
  // const start = Now();
  connection.bucket('_opLog')
    .subscribe(options, (data) => {
      // count++;
      console.log(data);
    });
}
getLogCount();
