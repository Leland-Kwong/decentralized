const DELIM = '\n';
const parseHeaders = (data) => {
  const headers = [];
  let i = -1;
  let startIndex = 0;
  const { length } = data || '';
  while(i++ < length) {
    const char = data[i];
    const isDelim = char === DELIM;
    if (isDelim) {
      headers.push(data.slice(startIndex, i));
      startIndex = i + 1;
    }
    const nextChar = data[i + 1];
    const isHeaderEnd = isDelim && nextChar === DELIM;
    if (isHeaderEnd) {
      return {
        headers,
        value: data.slice(startIndex + 1)
      };
    }
  }
};

module.exports = parseHeaders;
