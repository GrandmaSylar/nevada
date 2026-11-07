require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const { initDb } = require('./db');
const { router: authRouter } = require('./routes/auth');
const adminRouter = require('./routes/admin');
const publicRouter = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static Files (css, images)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serverless DB Init Middleware (ensures MSSQL is connected on cold starts)
app.use(async (req, res, next) => {
  try {
    await initDb();
  } catch (err) {
    console.error('Lazy DB initialization error:', err);
  }
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/p', publicRouter);

// Admin Web Dashboard Page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Root Landing
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Standalone Server Start (Only when running locally / Docker, not in Vercel serverless)
if (!process.env.VERCEL) {
  initDb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n==============================================`);
      console.log(`🚀 Nevada Digital NFC Card Server running on:`);
      console.log(`   - Local:    http://localhost:${PORT}`);
      console.log(`   - Network:  http://0.0.0.0:${PORT}`);
      console.log(`   - Admin:    http://localhost:${PORT}/admin`);
      console.log(`==============================================\n`);
    });
  }).catch(err => {
    console.error('Fatal startup error:', err);
  });
}

module.exports = app;
