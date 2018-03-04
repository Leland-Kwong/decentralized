const Token = require('./login/token');
const { verify, getByTokenId } = Token({ storeName: 'client' });

const unauthorizeRequest = (
  res,
  response = {}
) => {
  res.status(401).send(response);
};

const Now = require('performance-now');
const authPerfLoggedIn = require('debug')('authPerf.loggedIn');

/*
  Verifies the auth token and sets token metadata onto the request object so
  the subsequent middleware methods can use that data.
 */
const authCheck = async (req, res, next) => {
  const start = Now();
  const { authorization } = req.headers;

  const requestToken = authorization && authorization.replace('Bearer ', '');

  if (!requestToken) {
    return unauthorizeRequest(res, {
      errorCode: 0,
      errorMsg: 'authorization required'
    });
  }

  try {
    // verify
    await verify(requestToken);
    const fullToken = await getByTokenId(requestToken);
    req.user = {
      sub: fullToken.userId
    };
    req.userId = fullToken.userId;
    req.decodedToken = fullToken;
    authPerfLoggedIn(Now() - start);
    next();
  } catch(err) {
    console.log(err);
    res.status(500)
      .send('an error occurred while authenticating.');
  }
};

module.exports = authCheck;
