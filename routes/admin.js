const express = require('express');
const db = require('../database');
const { Admin, Textile, Supplier, Stock, ScanHistory, KnowledgeBase } = require('../models/schemas');

const router = express.Router();

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [textileCount, supplierCount, stockCount, scanCount, kbCount] = await Promise.all([
      Textile.countDocuments(),
      Supplier.countDocuments({ is_active: 1 }),
      Stock.countDocuments({ is_available: 1 }),
      ScanHistory.countDocuments(),
      KnowledgeBase.countDocuments({ is_active: true }),
    ]);

    // Low stock items
    const allStock = await Stock.find({ is_available: 1, quantity_meters: { $lt: 50 } }).lean();
    const textiles = await Textile.find().lean();
    const lowStock = allStock.map(s => {
      const t = textiles.find(tx => String(tx._id) === String(s.textile_id));
      return { stock_id: s._id, textile_name: t ? t.name : 'Unknown', quantity: s.quantity_meters };
    });

    // Recent scans
    const recentScans = await ScanHistory.find().sort({ scanned_at: -1 }).limit(10).lean();

    // Top searched colors
    const scans = await ScanHistory.find().lean();
    const colorCounts = {};
    scans.forEach(s => { if (s.detected_color) colorCounts[s.detected_color] = (colorCounts[s.detected_color] || 0) + 1; });
    const topColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([color, count]) => ({ color, count }));

    // Total stock meters
    const totalStockAgg = await Stock.aggregate([{ $match: { is_available: 1 } }, { $group: { _id: null, total: { $sum: '$quantity_meters' } } }]);
    const totalStockMeters = totalStockAgg.length > 0 ? totalStockAgg[0].total : 0;

    res.json({
      counts: { textiles: textileCount, suppliers: supplierCount, stock_entries: stockCount, total_scans: scanCount, knowledge_base: kbCount, total_stock_meters: totalStockMeters },
      low_stock: lowStock.slice(0, 10),
      recent_scans: recentScans.map(s => ({ ...s, id: s._id })),
      top_colors: topColors,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/admin/textiles
router.get('/textiles', async (req, res) => {
  try {
    const textiles = await Textile.find().sort({ created_at: -1 }).lean();
    const allStock = await Stock.find({ is_available: 1 }).lean();
    const enriched = textiles.map(t => ({
      ...t, id: t._id,
      total_stock: allStock.filter(s => String(s.textile_id) === String(t._id)).reduce((sum, s) => sum + (s.quantity_meters || 0), 0),
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /api/admin/suppliers
router.get('/suppliers', async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ name: 1 }).lean();
    res.json(suppliers.map(s => ({ ...s, id: s._id })));
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /api/admin/stock
router.get('/stock', async (req, res) => {
  try {
    const stockList = await Stock.find().lean();
    const textiles = await Textile.find().lean();
    const suppliers = await Supplier.find().lean();
    const enriched = stockList.map(s => ({
      ...s, id: s._id,
      textile_name: textiles.find(t => String(t._id) === String(s.textile_id))?.name || 'Unknown',
      supplier_name: suppliers.find(sp => String(sp._id) === String(s.supplier_id))?.name || 'Unknown',
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// ===== Knowledge Base CRUD =====

// GET /api/admin/knowledge-base
router.get('/knowledge-base', async (req, res) => {
  try {
    const entries = await KnowledgeBase.find().sort({ textile_type: 1 }).lean();
    res.json(entries.map(e => ({ ...e, id: e._id })));
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /api/admin/knowledge-base/:id
router.get('/knowledge-base/:id', async (req, res) => {
  try {
    const entry = await KnowledgeBase.findById(req.params.id).lean();
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json({ ...entry, id: entry._id });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /api/admin/knowledge-base
router.post('/knowledge-base', async (req, res) => {
  const { textile_type, origin, description, typical_colors, typical_patterns, material_category, identifying_features, texture_keywords } = req.body;
  if (!textile_type || !origin || !material_category) return res.status(400).json({ error: 'textile_type, origin, material_category required' });
  try {
    const entry = await db.insert('knowledge_base', {
      textile_type, origin, description: description || '',
      typical_colors: Array.isArray(typical_colors) ? typical_colors : (typical_colors || '').split(',').map(c => c.trim()).filter(Boolean),
      typical_patterns: Array.isArray(typical_patterns) ? typical_patterns : (typical_patterns || '').split(',').map(p => p.trim()).filter(Boolean),
      material_category,
      identifying_features: identifying_features || '',
      texture_keywords: Array.isArray(texture_keywords) ? texture_keywords : (texture_keywords || '').split(',').map(k => k.trim()).filter(Boolean),
    });
    res.status(201).json(entry);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/admin/knowledge-base/:id
router.put('/knowledge-base/:id', async (req, res) => {
  try {
    const existing = await KnowledgeBase.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const fields = ['textile_type', 'origin', 'description', 'typical_colors', 'typical_patterns', 'material_category', 'identifying_features', 'texture_keywords', 'is_active'];
    const updates = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (['typical_colors', 'typical_patterns', 'texture_keywords'].includes(f) && typeof req.body[f] === 'string') {
          updates[f] = req.body[f].split(',').map(v => v.trim()).filter(Boolean);
        } else {
          updates[f] = req.body[f];
        }
      }
    }
    const updated = await db.update('knowledge_base', req.params.id, updates);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// DELETE /api/admin/knowledge-base/:id
router.delete('/knowledge-base/:id', async (req, res) => {
  try {
    const result = await db.delete('knowledge_base', req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
