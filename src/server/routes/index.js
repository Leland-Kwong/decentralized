module.exports = (app) => {
  require('../login')(app);
  require('../login/logout')(app);
  require('../login/refresh-token')(app);
};
