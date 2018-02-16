let hasExpired = false;
let refreshTokenTimer = null;

const msPerHour = 1000 * 60 * 60;
const hoursToMS = (hours) =>
  msPerHour * hours;
const durationFromExpiration = (expiration) =>
  expiration - new Date().getTime();

const getAccessToken = (loginCode) => {
  const url = constructApiUrl(`/api/access-token/${loginCode}`, projectID, customOrigin);
  return fetch(url, {
    method: 'GET',
  }).then(handleFetch)
    .then(res => res.json())
    .then(json => {
      const { expiresAt, userID } = json;
      if (json.error) {
        session.end();
        return json;
      }
      session.set({
        ...json,
        duration: durationFromExpiration(expiresAt)
      });
      authStateChangeFn(userID);
      return json;
    });
};

const scheduleTokenRefresh = ({ expiresAt }) => {
  if (refreshTokenTimer) {
    return;
  }
  const tokenDuration = session.get().duration;
  const expiresIn = expiresAt - new Date().getTime();
  /*
    Refresh 2 hours from last refresh. This allows us to keep the session fresher
    as long as the user is continuously using it.
   */
  let delay = expiresIn - tokenDuration + tokenRefreshRate;
  delay = delay < 0 ? 0 : delay;

  hasExpired = expiresIn <= 0;
  if (!hasExpired) {

    // log session duration info
    if (DEVELOPMENT) {
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
        .then(scheduleTokenRefresh)
        .catch(err => console.error(err));
    }, delay);
  } else {
    refreshTokenTimer = null;
    logout();
  }
};
