const { destroy } = require('./token');
const cors = require('cors');

module.exports = (app) => {
  app.options('/api/logout/:token', cors({ methods: ['POST'] }));
  app.post('/api/logout/:token', async (req, res) => {
    const { token: tokenId } = req.params;
    try {
      const result = await destroy(tokenId);
      console.log(result);
      if (result) {
        return res.send({ ok: 1 });
      }
    } catch(err) {
      console.error(err);
      res.status(400).send(err.message);
    }
  });
};
