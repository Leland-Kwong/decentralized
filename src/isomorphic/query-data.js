// queries the data so that we can do transformations

const graphql = require('graphql-anywhere').default;
const gql = require('graphql-tag').default;
const defaultResolver = function(fieldName, root, args) {
  const data = root[fieldName];
  if (args) {
    if (args.length) {
      return data.length;
    }
    if (args.slice) {
      const [start, end] = args.slice;
      return data.slice(start, end);
    }
  }
  return data;
};

function queryData(query, data) {
  if (!query) return data;

  const document = 'object' === typeof query
    ? query.document
    : query;

  const noQueryDocument = 'undefined' === typeof document;
  if (noQueryDocument) {
    // default to no querying for undefined documents
    return data;
  }

  const variables = query.variables;
  return query
    ? graphql(defaultResolver, gql(document), data, null, variables)
    : data;
}

module.exports = queryData;
