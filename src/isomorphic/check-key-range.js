const undef = 'undefined';
const emptyLowerBound = '';
module.exports = (
  gt = emptyLowerBound,
  gte = emptyLowerBound,
  lt = Infinity,
  lte = Infinity,
) => (key) => {
  const hasLt = undef !== lt;
  const hasLte = !hasLt || undef !== lte;
  return (key > gt || key >= gte)
    && (
      (hasLt && hasLte)
      || (hasLt && key < lt)
      || (hasLte && key <= lte)
    );
};
