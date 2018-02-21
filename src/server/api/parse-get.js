const decodeData = require('../key-value-store/decode-data');
// parses the value based on the data type
const parseGet = (data) => {
  const { headers, value } = decodeData(data);
  const type = headers[0];
  if (type === 'dbLog') {
    const [b, k, a] = headers.slice(1);
    return { b, k, a, v: value };
  }
  return type === 'json' ? JSON.parse(value) : value;
};
module.exports = parseGet;
