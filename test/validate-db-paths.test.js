import {
  validateBucket,
  validateKey
} from '../src/server/modules/validate-db-paths.js';

test('validate mutation', () => {
  expect(
    () => validateBucket('')
  ).toThrow();

  expect(
    () => validateKey('')
  ).toThrow();

  expect(
    () => validateBucket('foo/')
  ).toThrow();

  expect(
    () => validateKey('foo/')
  ).toThrow();

  expect(
    validateBucket('foo_')
  ).toBe(true);

  expect(
    validateKey('foo_')
  ).toBe(true);
});
