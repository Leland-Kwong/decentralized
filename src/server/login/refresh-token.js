// TODO: consider storing inactive tokens in database. The issue here is we're refreshing tokens often, but previously unexpired tokens still continue to work. #mvp

const AccessToken = require('./token');
const { expiresIn, expirationTimeUnix } = require('./token-expiration');

module.exports = async (req, res) => {
  // grab the latest changes for a project
  const { decodedToken } = req;
  const expiresAt = expirationTimeUnix(expiresIn);
  try {
    const newToken = await AccessToken.refresh(
      decodedToken.tokenId,
      expiresAt
    );
    res.send({
      accessToken: newToken.tokenId,
      expiresAt
    });
  } catch(err) {
    console.log(err);
    res.status(500).send('error refreshing token');
  }
};
