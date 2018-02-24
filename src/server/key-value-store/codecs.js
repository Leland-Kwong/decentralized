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

const HEADER_DELIM = '\n';
const decodeData = (data) => {
  const headers = [];
  let i = -1;
  let startIndex = 0;
  const { length } = data || '';
  while(i++ < length) {
    const char = data[i];
    const isDelim = char === HEADER_DELIM;
    if (isDelim) {
      headers.push(data.slice(startIndex, i));
      startIndex = i + 1;
    }
    const nextChar = data[i + 1];
    // value delimiter is \n\n
    const isHeaderEnd = isDelim && nextChar === HEADER_DELIM;
    if (isHeaderEnd) {
      return {
        headers,
        value: data.slice(startIndex + 1)
      };
    }
  }
  // default to returning the raw value
  return {
    headers,
    value: data
  };
};

const delim = require('../modules/delim');
const encodeData = (input = {}) => {
  const { type, value, meta = '' } = input;
  if ('undefined' === typeof value) {
    throw new Error('put expects a \`value\` property, received \`undefined\`');
  }
  const normalizedValue = type === 'json'
    ? JSON.stringify(value)
    : value;
  const metadata = meta ? `${HEADER_DELIM}${meta}` : '';
  const out = `${type}${metadata}${delim.v}${normalizedValue}`;
  return out;
};

module.exports = {
  encodeData,
  decodeData
};
