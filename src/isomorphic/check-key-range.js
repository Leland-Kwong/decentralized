const emptyLowerBound = '';
module.exports = (
  gt = emptyLowerBound,
  gte = emptyLowerBound,
  lt = Infinity,
  lte = Infinity,
) => (key) => {
  return (key > gt || key >= gte)
    && (key < lt || key <= lte);
};
