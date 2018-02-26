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

const encodeData = (input = {}) => {
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

module.exports = {
  encodeData,
  decodeData
};
