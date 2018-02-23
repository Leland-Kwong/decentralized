const undef = undefined; // eslint-disable-line no-undefined
module.exports = (
  gt,
  gte,
  lt,
  lte,
) => (val) => {
  const isGt = undef === gt || val > gt;
  const isGte = undef === gte || val >= gte;
  const isLt = undef === lt || val < lt;
  const isLte = undef === lte || val <= lte;
  return (isGt && isGte) && (isLt && isLte);
};
