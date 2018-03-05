const connectSocket = require('./socket-connect');
const connection = connectSocket();

const emitTracker = (() => {
  let count = 0;
  return {
    increment() {
      count++;
    },
    get() {
      return count;
    },
    reset() {
      count = 0;
    }
  };
})();

const manyConnections = () => {
  function createConnection() {
    connection.bucket('ticker').key('count')
      .subscribe(() => {
        emitTracker.increment();
        // console.log('tick child');
      });
    connection.bucket('_opLog')
      .subscribe({ limit: 3 }, () => {
        emitTracker.increment();
      });
  }
  const connectionsCount = {
    maxTested: 3500,
    lightLoad: 1
  };
  new Array(connectionsCount.lightLoad).fill(0)
    .forEach(createConnection);
};
