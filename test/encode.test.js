import { encodeData, delimiters } from '../src/server/key-value-store/codecs';
import Chance from 'chance';

const chance = Chance();
test('encode', () => {
  const list = new Array(2).fill(0).map(() => chance.paragraph());
  const input = {
    type: 'json',
    value: {
      list
    }
  };
  const output = encodeData(input);
  const encoded =
`${input.type}${delimiters.VALUE}${JSON.stringify(input.value)}`;
  expect(output).toBe(encoded);
});
