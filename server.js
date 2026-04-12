require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { authenticateToken, requireUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Public routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/textiles', require('./routes/textiles'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/scan', require('./routes/scan'));
app.use('/api/users', require('./routes/users'));

// User-protected routes (login required)
app.use('/api/cart', requireUser, require('./routes/cart'));
app.use('/api/orders', requireUser, require('./routes/orders'));

// User profile update needs auth
app.put('/api/users/profile', requireUser, (req, res, next) => next());
app.get('/api/users/me', requireUser, (req, res, next) => next());

// Protected routes (admin only)
app.use('/api/admin', authenticateToken, require('./routes/admin'));

// Protected CRUD routes - textiles POST/PUT/DELETE need auth
app.post('/api/textiles', authenticateToken, (req, res, next) => next());
app.put('/api/textiles/:id', authenticateToken, (req, res, next) => next());
app.delete('/api/textiles/:id', authenticateToken, (req, res, next) => next());

// Protected CRUD routes - suppliers POST/PUT/DELETE need auth
app.post('/api/suppliers', authenticateToken, (req, res, next) => next());
app.put('/api/suppliers/:id', authenticateToken, (req, res, next) => next());
app.delete('/api/suppliers/:id', authenticateToken, (req, res, next) => next());

// Protected stock routes
app.use('/api/stock', authenticateToken, require('./routes/stock'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Secret admin access — only accessible via direct URL with key
app.get('/api/admin-access/:key', (req, res) => {
  const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY || 'RJE_ADMIN_2026_SECRET';
  if (req.params.key === ADMIN_ACCESS_KEY) {
    res.json({ message: 'Admin access granted', login_endpoint: '/api/auth/login' });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const db = require('./database');

(async () => {
  try {
    await db.connect();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🧵 RJE Textile API Server running on port ${PORT}`);
      console.log(`📡 API endpoints ready at http://0.0.0.0:${PORT}/api\n`);
    });
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
})();
