import parseData from './parse-data';
import genList from 'genlist';

test('parse db data', () => {
  const chance = require('chance')();
  const type = 'json';
  const bucket = 'joe.chat';
  const value = JSON.stringify({
    foo: 'bar',
    paras: genList(1, () => chance.paragraph())
  });
  const data = `${type}\n${bucket}\n\n${value}`;
  const result = parseData(data);
  expect(result).toEqual({ headers: [type, bucket], value });
});
