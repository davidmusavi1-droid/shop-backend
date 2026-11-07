const { createAdminSessions } = require('../lib/admin-session');
const sessions = createAdminSessions({ prisma: require('../lib/prisma') });
const authenticate = sessions.authenticate({ extend: true });

function requireAdmin(req, res, next) {
  sessions.configured(req, res, () => authenticate(req, res, next));
}

module.exports = requireAdmin;
module.exports.sessions = sessions;
