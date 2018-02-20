import checkRange from '../src/isomorphic/check-key-range';

test('check key range', () => {
  let gt, gte, lt, lte;
  const key = '1519116363007';
  const isInRange = checkRange(gt, gte, lt, lte)(key);
  expect(isInRange).toBe(true);
});
