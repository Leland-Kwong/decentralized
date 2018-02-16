const noop = () => {};
const defaults = () => ({
  valueAsBuffer: false,
  keyAsBuffer: false
});
module.exports = function(
  options,
  callbacks = {}
) {
  const {
    onNext = noop,
    onError = noop,
    onComplete = noop
  } = callbacks;
  const opts = Object.assign(defaults(), options);
  const iter = this.db.db.iterator(opts);
  const handleNext = function(err, key, value) {
    if (iter._ended) {
      return;
    }
    if (!arguments.length) {
      return onComplete();
    }
    if (err) {
      return onError(err);
    }
    onNext({ key, value }, iter);
    iter.next(handleNext);
  };
  iter.next(handleNext);
  return iter;
};
