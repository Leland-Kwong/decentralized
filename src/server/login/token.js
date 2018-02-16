// TODO: add token blacklisting
// TODO: watch for changes to sessions collection so that if we make changes directly to the collection, we can invalidate the cache as necessary.

const crypto = require('crypto');
const ms = require('ms');
const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const path = require('path');
const sessionsDb = () => KV(path.join(dbBasePath, '_sessions'), {
  encoding: {
    valueEncoding: 'json'
  }
});

const cache = require('lru-cache')({ max: 100000 });

// grabs from cache first, then db if needed
const db = {
  async add(token) {
    const { tokenId, userId, expiresAt } = token;
    const fullToken = { _id: tokenId, userId, expiresAt };

    // TODO: add to actual database also
    try {
      (await sessionsDb())
        .put(tokenId, fullToken);
    } catch(err) {
      console.log(err);
      throw 'error adding token to db';
    }
    cache.set(tokenId, token);
    return token;
  },
  async get(tokenId) {
    const fromCache = cache.get(tokenId) || null;
    if (fromCache) {
      return fromCache;
    }
    try {
      const db = await sessionsDb();
      const fromDb = await db.get(tokenId);
      if (fromDb) {
        Object.defineProperty(fromDb, 'tokenId', {
          value: tokenId
        });
        return fromDb;
      }
    } catch(err) {
      if (err.type === 'NotFoundError') {
        return null;
      }
      console.error(err);
    }
  },
  async delete(tokenId) {
    try {
      (await sessionsDb()).del(tokenId);
      cache.del(tokenId);
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
  this.name = 'SessionError';
}

const Token = {
  sessionsDb,
  async create({
    userId,
    expiresAt = defaultExpiresAt() // currentTime + duration
  }) {
    if (!userId) {
      throw new TokenError('{userId} property must be provided');
    }
    const tokenId = crypto.randomBytes(12)
      .toString('hex');
    const token = { tokenId, userId, expiresAt };
    await db.add(token);
    return token;
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
      return {
        ok: 0,
        data: {
          type: 'TokenError',
          message: 'token expired'
        }
      };
    }
    if (!token) {
      return {
        ok: 0,
        data: {
          type: 'TokenError',
          message: 'token not found'
        }
      };
    }
    return {
      ok: 1
    };
  },
  async refresh(tokenId, expiresAt = defaultExpiresAt()) {
    const verifyResult = await Token.verify(tokenId);
    if (!verifyResult.ok) {
      console.log(verifyResult);
      throw new Error({ message: verifyResult.data.message });
    }
    const currentToken = await Token.getByTokenId(tokenId);
    const { userId } = currentToken;
    const newToken = await Token.create({ userId, expiresAt });
    // destroy previous token
    await Token.destroy(tokenId);
    return newToken;
  }
};

module.exports = Token;
