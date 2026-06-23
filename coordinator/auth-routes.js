'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyPassword } = require('./db');
const { requireAuth } = require('./auth-middleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pilar2-dev-secret';

router.post('/login', (req, res) => {
  const { entity, password } = req.body;
  if (!entity || !password) {
    return res.status(400).json({ error: 'entity and password required' });
  }

  const result = verifyPassword(entity, password);
  if (!result) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { name: result.name, displayName: result.display_name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, entity: { name: result.name, displayName: result.display_name } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ name: req.entity.name, displayName: req.entity.displayName });
});

module.exports = router;
