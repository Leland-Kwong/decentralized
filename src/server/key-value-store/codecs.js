// TODO: create a `write` function that receives the changeData and adds a version property to the changeData. This version will also be used for the opLog id as well as for the global to cache to check if the cache value should be updated. #mvp #priority-1

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

const encodeData = (input) => {
  const { value, type = (typeof value), meta = '' } = input;
  let normalizedValue;
  if ('undefined' === typeof value) {
    normalizedValue = '';
  } else {
    const isPlainObject = value && 'object' === typeof value;
    normalizedValue = isPlainObject
      ? JSON.stringify(value)
      : value;
  }
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
  const value = data.slice(valueDelimIndex + d.VALUE.length);
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
  encodeData,
  decodeData: parseGet
};
