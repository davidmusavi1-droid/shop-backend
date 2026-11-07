const express = require('express');

function createRouter(sessions) {
  const router = express.Router();
  router.use(sessions.configured);
  router.post('/login', sessions.sameOrigin, sessions.login);
  router.get('/', sessions.authenticate(), (req, res) => res.json(req.adminSession.state));
  router.post('/activity', sessions.authenticate({ extend: true }), (req, res) => res.json(req.adminSession.state));
  router.post('/logout', sessions.authenticate(), sessions.logout);
  return router;
}

module.exports = createRouter;
