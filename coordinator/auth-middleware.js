'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pilar2-dev-secret';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.entity = { name: decoded.name, displayName: decoded.displayName };
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = { requireAuth };
