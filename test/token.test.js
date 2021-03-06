/* global test */
import Token from '../src/server/login/token';
import ms from 'ms';

const tokenApis = Token({ storeName: 'token.test' });
const {
  sessionsDb,
  create,
  getByTokenId,
  destroy,
  verify,
  refresh
} = tokenApis;

const userId = 1234;
const createToken = (options = {}) => {
  const {
    expiresAt = new Date().getTime() + ms('24h')
  } = options;
  return create({
    userId,
    expiresAt
  });
};

afterAll(async () => {
  await (await sessionsDb()).drop();
});

describe('auth token methods', () => {

  test('create', async () => {
    const token = await createToken();
    expect(typeof token).toBe('object');
    expect(typeof token.tokenId).toBe('string');
    expect(token.userId).toBe(userId);
    expect(typeof token.expiresAt).toBe('number');
    // await dropDb();
  });

  test('creates a unique token each time', async () => {
    const token1 = await createToken();
    const token2 = await createToken();
    expect(token2.tokenId !== token1.tokenId).toBe(true);
  });

  test('get', async () => {
    const token = await createToken();
    const prevToken = await getByTokenId(token.tokenId);
    const { userId, expiresAt } = prevToken;
    expect(userId).toBe(userId);
    const time = new Date().getTime();
    expect(expiresAt > time).toBe(true);
  });

  test('destroy', async () => {
    const { tokenId } = await createToken();
    await destroy(tokenId);
    expect(await getByTokenId(tokenId)).toEqual(null);
  });

  test('refresh', async () => {
    const token = await createToken();

    // set the initial time to sometime in the future to mimic as
    // if we were refreshing later
    const advancedTimeMS = new Date().getTime() + 100;
    const newToken = await refresh(
      token.tokenId,
      advancedTimeMS + ms('24h')
    );
    expect(
      token.tokenId !== newToken.tokenId
    ).toBe(true);
    expect(
      token.userId === newToken.userId
    ).toBe(true);
    expect(
      (newToken.expiresAt - token.expiresAt) > 0
    ).toBe(true);
    expect(
      getByTokenId(token.tokenId).ok
    ).toBeFalsy();
  });

});

test('verifies auth token', async () => {
  const { tokenId } = await createToken({ expiresAt: new Date().getTime() + 10 });
  const verifyResult = await verify(tokenId);
  expect(verifyResult).toBeTruthy();
});

test('creates multiple tokens with same userId - handle multiple browsers', async () => {
  const t1 = await createToken({ userId });
  const t2 = await createToken({ userId });
  expect(t1.tokenId !== t2.tokenId).toBe(true);
});
