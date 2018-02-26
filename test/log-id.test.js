import LexId from '../src/isomorphic/lexicographic-id';

test('many unique lexicographic ids', () => {
  const logId = LexId();

  const ids = [];
  const count = 500000;

  for (let i = 0; i < count; i++) {
    ids.push(
      logId()
    );
  }

  let isSorted = true;
  const uniqueIds = new Map();
  for (let i = 0; i < count; i++) {
    const id = ids[i];
    const prevId = ids[i - 1];
    uniqueIds.set(id, true);
    if (id && prevId) {
      isSorted = id > prevId;
      if (!isSorted) {
        break;
      }
    }
  }

  expect(isSorted).toBe(true);
  expect(uniqueIds.size).toBe(count);
});
