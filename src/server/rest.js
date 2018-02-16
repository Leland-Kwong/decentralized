module.exports = (app) => {
  require('./login')(app);
  require('./login/logout')(app);
};
