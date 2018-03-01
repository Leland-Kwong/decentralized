// TODO: add tests

const { secret } = require('../config');
const crypto = require('crypto');
const cors = require('cors');
const Token = require('./token');
const ms = require('ms');
const { expiresIn, expirationTimeUnix } = require('./token-expiration');
require('dotenv').config();

const AccessToken = Token({ storeName: 'client' });

module.exports = {};

const userIdFromEmail = (email) =>
  crypto.createHmac('sha256', secret)
    .update(email)
    .digest('hex');

const mailgun = require('mailgun-js')({
  domain: process.env.MAILGUN_DOMAIN,
  apiKey: process.env.MAILGUN_API_KEY
});
const send = (msg) => {
  return new Promise((resolve, reject) => {
    mailgun.messages().send(msg, function (error, body) {
      if (error) reject(error);
      else resolve(body);
    });
  });
};

const emailCodeDuration = '5m';
const emailCodeExpirationHumanized = () => {
  const ms = require('ms');
  return ms(ms(emailCodeDuration), { long: true });
};

const companyName = 'lucidbyte';

const Table = (children) => {
  return /* @html */`
    <table style="font-size: 14px;">
      <tbody>
        <tr>${children}</tr>
      </tbody>
    </table>
  `;
};

const html = (loginCode) => {
  const code = /* @html */`
    <strong style="background: #000; color: #fff; padding: 5px;">
      ${loginCode}
    </strong>
  `;
  return Table(/* @html */`
    <h1 style="text-align: center; font-size: 18px">${companyName}</h1>
    <div style="text-align: center;">
      <p>Your login code is:</p>
      <p>${code}</p>
      <small style="color: inherit">
        This code expires in <strong>${emailCodeExpirationHumanized()}</strong>
      </small>
      <p style="color: rgb(143, 143, 143);">
        <small>
          If you didn't attempt to log in but received this email, please ignore this email. If you are concerned about your account's safety, please reply to this email to get in touch with us.
        </small>
      </p>
      <!-- <p>Heres your Access Token: </p>
      <strong style="background: #000; color: #fff; padding: 5px;">
        ${loginCode}
      </strong> -->
    </div>
  `);
};

const text = () =>
  `Email confirmation requested`;

const sendMail = async ({ email, loginCode, origin }) => {
  const msg = {
    to: email,
    from: 'login@lucidbyte.com',
    subject: `${companyName} login code: ${loginCode}`,
    text: text(await loginCode),
    html: html(await loginCode, origin),
  };
  return send(msg);
};

const loginCodesCache = require('lru-cache')({ maxAge: ms(emailCodeDuration) });

const loginUser = async ({ res, email, origin, isNewAccount = false }) => {
  const userId = userIdFromEmail(email);
  try {
    const accessToken = await AccessToken.create({ userId });
    const loginCode = require('shortid').generate();
    loginCodesCache.set(loginCode, {
      accessToken,
      expiresAt: expirationTimeUnix(expiresIn),
      userId,
      isNewAccount,
      email
    });
    await sendMail({ email, loginCode, origin });
    res.send({
      errors: null,
      message: 'email successfully sent'
    });
  } catch(err) {
    console.log(err);
    res.status(400).send({
      error: 'an error occurred while trying to send an email',
    });
  }
};

module.exports = (app) => {
  const loginCors = cors({ methods: ['POST'] });
  app.options('/api/login', loginCors);
  app.post('/api/login', loginCors, async (req, res) => {
    const { origin } = req.headers;
    const { email } = req.body;

    loginUser({ res, email, origin })
      .catch(err => console.log('error logging in via email', err));
  });

  const accessTokenPath = '/api/access-token/:loginCode';
  const loginErrors = {
    expired: {
      status: 401,
      code: 0,
      message: 'login code has expired, please login again'
    },
    invalidCode: {
      status: 401,
      code: 1,
      message: 'invalid login code'
    }
  };
  const hasLoginCodeExpired = (accessData) => {
    if (accessData) {
      const { expiresAt } = accessData;
      const hasExpired = new Date().getTime() - expiresAt < 0;
      return hasExpired;
    }
    return false;
  };
  app.get(accessTokenPath, cors(), async (req, res) => {
    const { loginCode } = req.params;
    const accessData = loginCodesCache.get(loginCode);

    if (accessData) {
      const { accessToken, userId, expiresAt } = accessData;

      // delete as soon as we've used it
      loginCodesCache.del(loginCode);
      res.send({
        accessToken: accessToken.tokenId,
        expiresAt,
        userId
      });
    } else if (hasLoginCodeExpired(accessData)) {
      res.status(401).send(loginErrors.expired);
    } else {
      res.status(401).send(loginErrors.invalidCode);
    }
  });
};

Object.assign(module.exports, {
  userIdFromEmail,
  AccessToken
});
