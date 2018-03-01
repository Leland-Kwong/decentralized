import {
  validateBucket,
} from '../src/server/modules/validate-db-paths.js';

test('validate mutation', () => {
  expect(
    () => validateBucket('')
  ).toThrow();

  expect(
    () => validateBucket('foo/')
  ).toThrow();

  expect(
    validateBucket('foo_')
  ).toBe(true);
});
