import queryData from '../src/isomorphic/query-data';

test('query data', () => {
  const data = {
    foo: 'bar',
    data: {
      list: [1, 2, 3]
    }
  };
  const query = {
    document: /* GraphQL */`
      {
        data {
          list
        }
      }
    `,
  };
  const queriedData = queryData(query, data);
  expect(queriedData).toEqual({ data: data.data });

  const queryArray = /* GraphQL */`
    {
      data {
        list(slice: [0, 1])
      }
    }
  `;
  expect(queryData(queryArray, data))
    .toEqual({
      data: {
        list: data.data.list.slice(0, 1)
      }
    });
});
