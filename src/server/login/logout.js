const { destroy } = require('./token');
const cors = require('cors');

module.exports = (app) => {
  const corsOptions = cors({ methods: ['POST'] });
  app.options('/api/logout/:token', corsOptions);
  app.post('/api/logout/:token', corsOptions, async (req, res) => {
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
