export default function inspect(params = {}, callback) {
  const {
    bucket = this._bucket,
    query
  } = callback ? params : {};
  const _callback = callback || params;
  this.subscribe({
    bucket,
    limit: 1
  }, () => {
    this.socket.emit('inspect.db', { bucket, query }, _callback);
  });
}
