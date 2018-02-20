const undef = 'undefined';
module.exports = (gt, gte, lt, lte, key) => {
  return (
    (undef === typeof gt || key > gt) ||
    (undef === typeof gte || key >= gte)
  ) && (
    (undef === typeof lt || key < lt) ||
    (undef === typeof lte && key <= lte)
  );
};
