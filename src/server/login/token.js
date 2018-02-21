// TODO: add token blacklisting

const crypto = require('crypto');
const ms = require('ms');
const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const sessionsDb = () => KV(dbBasePath({ bucket: '_sessions' }), {
  encoding: {
    valueEncoding: 'json'
  }
});

const cache = require('lru-cache')({ max: 100000 });

// grabs from cache first, then db if needed
const db = {
  async add(token) {
    const { tokenId, userId, expiresAt } = token;
    const fullToken = { tokenId, userId, expiresAt };

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
      return fromDb;
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
  this.name = 'TokenError';
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
      throw new TokenError('token not found');
    }
    return true;
  },
  async refresh(tokenId, expiresAt = defaultExpiresAt()) {
    try {
      await Token.verify(tokenId);
      const currentToken = await Token.getByTokenId(tokenId);
      const { userId } = currentToken;
      const newToken = await Token.create({ userId, expiresAt });
      // destroy previous token
      await Token.destroy(tokenId);
      return newToken;
    } catch(err) {
      throw new Error(err.message);
    }
  }
};

module.exports = Token;
