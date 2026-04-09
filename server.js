require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
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

// Protected routes (admin only)
app.use('/api/auth/change-password', authenticateToken, require('./routes/auth'));
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

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const db = require('./database');

(async () => {
  try {
    await db.connect();
    app.listen(PORT, () => {
      console.log(`\n🧵 RJE Textile API Server running on http://localhost:${PORT}`);
      console.log(`📡 API endpoints ready at http://localhost:${PORT}/api\n`);
    });
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
})();
