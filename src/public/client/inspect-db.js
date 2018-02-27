const defaults = {
  reverse: true,
  limit: 1,
};

// tails the bucket
module.exports = function inspect(params = {}, callback, onComplete) {
  const options = Object.assign({}, defaults, callback ? params : {});
  const _callback = callback || params;
  this.subscribe(options, _callback, onComplete);
};
