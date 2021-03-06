// TODO: add token blacklisting

const crypto = require('crypto');
const ms = require('ms');
const getDbClient = require('../modules/get-db');
const { putWithLog, delWithLog } = require('../key-value-store');

function Token(params) {
  const { storeName } = params;
  const sessionsDb = getDbClient(storeName);

  const bucket = '_sessions';
  // grabs from cache first, then db if needed
  const db = {
    async add(token) {
      const { tokenId } = token;
      const putValue = { type: 'json', value: token, actionType: 'put' };

      try {
        const db = await sessionsDb;
        await putWithLog(db, { bucket, key: tokenId }, putValue);
      } catch(err) {
        console.log(err);
        throw 'error adding token to db';
      }
      return token;
    },
    async get(tokenId) {
      try {
        const db = await sessionsDb;
        const fromDb = await db.get({ bucket, key: tokenId });
        return fromDb;
      } catch(err) {
        console.error(err);
      }
    },
    async delete(tokenId) {
      try {
        await delWithLog(await sessionsDb, { bucket, key: tokenId });
        return { ok: 1 };
      } catch (err) {
        console.log(err);
      }
    }
  };

  // current time in ms
  const TimeMS = () => new Date().getTime();
  const defaultExpiresAt = () => TimeMS() + ms('24h');

  function TokenError(message) {
    this.message = message;
    this.name = 'TokenError';
  }

  const apis = {
    sessionsDb,
    async create({
      userId,
      expiresAt = defaultExpiresAt() // currentTime + duration
    }) {
      if (!userId) {
        throw new TokenError('{userId} property must be provided');
      }
      // [minimum session token size](https://www.owasp.org/index.php/Insufficient_Session-ID_Length)
      const tokenId = crypto.randomBytes(12)
        .toString('hex');
      const token = { tokenId, userId, expiresAt };
      try {
        await db.add(token);
        return token;
      } catch(err) {
        throw new TokenError(err.msg);
      }
    },
    async getByTokenId(tokenId) {
      return await db.get(tokenId);
    },
    async destroy(tokenId) {
      return await db.delete(tokenId);
    },
    async verify(tokenId) {
      const token = await db.get(tokenId);
      const time = TimeMS();
      const hasExpired = token && (token.expiresAt < time);
      if (hasExpired) {
        throw new TokenError('token expired');
      }
      if (!token) {
        throw new TokenError('invalid token');
      }
      return token;
    },
    async refresh(tokenId, expiresAt = defaultExpiresAt()) {
      try {
        await apis.verify(tokenId);
        const currentToken = await apis.getByTokenId(tokenId);
        const { userId } = currentToken;
        const newToken = await apis.create({ userId, expiresAt });
        // destroy previous token
        await apis.destroy(tokenId);
        return newToken;
      } catch(err) {
        throw new Error(err.message);
      }
    }
  };
  return apis;
}
module.exports = Token;
