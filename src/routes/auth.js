const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');

const router = express.Router();

// Simple signed-like or token-based session cookie
const SESSION_COOKIE_NAME = 'nevada_admin_session';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const admin = await db.getAdminByEmail(email);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const match = bcrypt.compareSync(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Set simple secure cookie
    res.cookie(SESSION_COOKIE_NAME, admin.id, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
    });

    return res.json({ success: true, email: admin.email });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME);
  return res.json({ success: true });
});

router.get('/me', (req, res) => {
  const session = req.cookies[SESSION_COOKIE_NAME];
  if (!session) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true });
});

// Middleware for protecting admin API endpoints
function requireAuth(req, res, next) {
  const session = req.cookies[SESSION_COOKIE_NAME];
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  next();
}

module.exports = { router, requireAuth, SESSION_COOKIE_NAME };

