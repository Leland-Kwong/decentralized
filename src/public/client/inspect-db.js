// tails the bucket
export default function inspect(params = {}, callback) {
  const {
    bucket = this._bucket,
    query
  } = callback ? params : {};
  const _callback = callback || params;
  this.subscribe({
    bucket,
    query,
    reverse: true,
    limit: 1
  }, _callback);
}
