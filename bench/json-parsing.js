const Perf = require('perf-profile');

const lorem = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';
const object = {
  foo: 'lorem abc',
  bar: 'fig newton',
  nested: {
    apple: 'chips'
  },
  lorem: new Array(10).fill(lorem).join(''),
  // lorem2: lorem
};

const count = 10000;
const items = new Array(count).fill(0).map(() => object);

function encode(data) {
  let id = 0;
  const mapping = [];
  const encodedJSON = JSON.stringify(data, (k, v) => {
    if (v && typeof v === 'object') {
      return v;
    }
    const _id = id++;
    mapping.push(v);
    return _id;
  });
  return encodedJSON + '\n' + mapping.join('\n');
}

function replaceValues(object, mapping) {
  for (const key in object) {
    const v = object[key];
    if (typeof v === 'number') {
      object[key] = mapping[v];
    } else {
      replaceValues(v, mapping);
    }
  }
  return object;
}

function decode(encodedJSON) {
  const firstNewlineIndex = encodedJSON.indexOf('\n');
  const obj = encodedJSON.slice(0, firstNewlineIndex);
  const mapping = encodedJSON.slice(firstNewlineIndex + 1).split('\n');
  const object = JSON.parse(obj);
  return replaceValues(object, mapping);
}

const encoded = items.map(encode);

// const stringified = items.map(v => JSON.stringify(v));

Perf('parse');

// stringified.map(v => JSON.parse(v))

const decoded = encoded.map(decode);

console.log(
  Perf('parse'),
  // decoded[0]
);
