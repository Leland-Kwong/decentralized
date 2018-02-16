const sessions = require('../../../db/sessions-collection');

module.exports = async (userId) => {
  return (await sessions).remove({ userId });
};
