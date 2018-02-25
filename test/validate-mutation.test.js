import { validate } from '../src/server/modules/validate-mutation';

test('validate mutation', () => {
  expect(
    () => validate('', '')
  ).toThrow();

  expect(
    () => validate('foo_', 'foo/')
  ).toThrow();

  expect(
    () => validate('foo/', 'foo')
  ).toThrow();

  expect(
    validate('foo_', 'foo-')
  ).toBe(true);
});
