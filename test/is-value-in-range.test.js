import checkRange from '../src/isomorphic/is-value-in-range';

describe('check key range', () => {
  test('string', () => {
    let gt, gte, lt, lte;
    const key = 'message';

    const isInRange = checkRange(gt, gte, lt, lte)(key);
    expect(isInRange).toBe(true);

    const isInRange2 = checkRange(gt, 'message', lt, 'message1')(key);
    expect(isInRange2).toBe(true);
  });

  test('number', () => {
    let gt, gte, lt, lte;
    const key = 1235562;
    const isInRange = checkRange(gt, gte, lt, lte)(key);
    expect(isInRange).toBe(true);
  });
});
