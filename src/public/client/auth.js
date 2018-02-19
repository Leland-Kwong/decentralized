const session = require('./session').default;
const { serverApiBaseRoute } = require('./config');

let hasExpired = false;
let refreshTokenTimer = null;

const msPerHour = 1000 * 60 * 60;
const hoursToMS = (hours) =>
  msPerHour * hours;
const durationFromExpiration = (expiration) =>
  expiration - new Date().getTime();

const defaults = {
  tokenRefreshRate: hoursToMS(2)
};

const handleError = (data) => Promise.reject(data);

const handleFetch = (res) => {
  const isError = res.status >= 400;
  if (isError) {
    return res.json()
      .then(handleError);
  }
  return res;
};

const getRefreshToken = () => {
  const url = `${serverApiBaseRoute}/api/refresh-token`;
  const token = session.get().accessToken;
  return fetch(url, {
    headers: {
      authorization: `Bearer ${token}`
    },
    method: 'GET',
  }).then(res => res.json())
    .then(res => {
      const { expiresAt } = res;
      session.set({
        ...res,
        duration: durationFromExpiration(expiresAt),
        userId: session.get().userId
      });
      return res;
    });
};

export const scheduleTokenRefresh = ({
  expiresAt,
  refreshRate = defaults.tokenRefreshRate
}, onRefresh) => {
  if (refreshTokenTimer) {
    return;
  }
  const tokenDuration = session.get().duration;
  const expiresIn = expiresAt - new Date().getTime();
  /*
    Refresh 2 hours from last refresh. This allows us to keep the session fresher
    as long as the user is continuously using it.
   */
  let delay = expiresIn - tokenDuration + refreshRate;
  delay = delay < 0 ? 0 : delay;

  hasExpired = expiresIn <= 0;
  if (!hasExpired) {

    // log session duration info
    if (process.env.NODE_ENV === 'dev') {
      const MSToHours = (ms) =>
        Number((ms / msPerHour).toFixed(2));

      console.log({
        refreshIn: MSToHours(delay) + 'hrs',
        duration: tokenDuration,
        expiresIn: MSToHours(expiresIn),
        expiresAt: new Date(expiresAt)
      });
    }

    refreshTokenTimer = setTimeout(() => {
      refreshTokenTimer = null;
      getRefreshToken()
        .then((fullToken) => {
          scheduleTokenRefresh({ expiresAt: fullToken.expiresAt });
          onRefresh(fullToken);
        })
        .catch(err => console.error(err));
    }, delay);
  } else {
    refreshTokenTimer = null;
  }
};

export const requestAccessToken = (loginCode) => {
  const url = `${serverApiBaseRoute}/api/access-token/${loginCode}`;
  return fetch(url, {
    method: 'GET',
  }).then(handleFetch)
    .then(res => res.json())
    .then(json => {
      const { expiresAt } = json;
      if (json.error) {
        session.end();
        return json;
      }
      session.set({
        ...json,
        duration: durationFromExpiration(expiresAt)
      });
      scheduleTokenRefresh({
        expiresAt
      });
      return json;
    });
};
