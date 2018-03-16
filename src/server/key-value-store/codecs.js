/*
  Parses data by first handling the headers, then the values.
  Data format is as follows:

  ** data start **
  [header 1]
  [header 2]
  ...other headers

  [value]
  ** data end **
 */

// delimeters
const d = {
  HEADER: '\n',
  VALUE: '\n\n'
};

function memoizeLast(fn) {
  let lastInput;
  let lastOutput;
  return function(input, memoize = true) {
    if (memoize && (lastInput === input)) {
      return lastOutput;
    }
    lastInput = input;
    lastOutput = fn(input);
    return lastOutput;
  };
}

const normalizedValueMem = memoizeLast((input) => {
  if ('undefined' === typeof input) {
    return '';
  } else {
    const isPlainObject = input && 'object' === typeof input;
    return isPlainObject
      ? JSON.stringify(input)
      : input;
  }
});

const encodeData = (input) => {
  const { value, type = (typeof value), meta = '' } = input;
  const normalizedValue = normalizedValueMem(value);
  const metadata = meta ? `${d.HEADER}${meta}` : '';
  const out = `${type}${metadata}${d.VALUE}${normalizedValue}`;
  return out;
};

const decodeData = (data) => {
  if ('undefined' === typeof data) {
    throw `[DecodeException] data is undefined`;
  }
  const valueDelimIndex = data.indexOf(d.VALUE);
  const headers = data.slice(0, valueDelimIndex).split(d.HEADER);
  let value = data.slice(valueDelimIndex + d.VALUE.length);
  const [type] = headers;
  if (type === 'number') {
    value = Number(value);
  }
  // default to returning the raw value
  return {
    headers,
    value
  };
};

const parseGet = (data) => {
  const { headers, value } = decodeData(data);
  const type = headers[0];
  let parsed;
  if (type === 'dbLog') {
    const [b, k, a] = headers.slice(1);
    parsed = { b, k, a, v: value };
  } else {
    parsed = type === 'json'
      ? JSON.parse(value)
      : value;
  }
  return {
    parsed,
    raw: data
  };
};

module.exports = {
  normalizedValueMem,
  delimiters: d,
  encodeData,
  decodeData: parseGet
};
