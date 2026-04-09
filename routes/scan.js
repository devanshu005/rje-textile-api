const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { Textile, Stock, Supplier, ScanHistory, KnowledgeBase } = require('../models/schemas');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads', 'scans');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `scan_${Date.now()}_${Math.round(Math.random() * 1E6)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)), limits: { fileSize: 10 * 1024 * 1024 } });

function rgbToColorName(r, g, b) {
  const colors = {
    red: [255, 0, 0], blue: [0, 0, 255], green: [0, 128, 0], yellow: [255, 255, 0],
    orange: [255, 165, 0], purple: [128, 0, 128], pink: [255, 192, 203], white: [255, 255, 255],
    black: [0, 0, 0], brown: [139, 69, 19], grey: [128, 128, 128], beige: [245, 245, 220],
    maroon: [128, 0, 0], navy: [0, 0, 128], teal: [0, 128, 128], gold: [255, 215, 0],
    coral: [255, 127, 80], cream: [255, 253, 208], indigo: [75, 0, 130],
    mustard: [255, 219, 88], wine: [114, 47, 55], ivory: [255, 255, 240],
    honey: [235, 177, 52], pastel: [190, 190, 220],
  };
  let closest = 'white', minD = Infinity;
  for (const [name, [cr, cg, cb]] of Object.entries(colors)) {
    const d = Math.sqrt((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2);
    if (d < minD) { minD = d; closest = name; }
  }
  return closest;
}

async function detectPattern(imagePath) {
  try {
    const sharp = require('sharp');
    const { channels } = await sharp(imagePath).stats();
    const avgStdDev = channels.reduce((s, c) => s + c.stdev, 0) / channels.length;
    if (avgStdDev < 15) return 'Plain';
    if (avgStdDev < 30) return 'Subtle';
    if (avgStdDev < 50) return 'Stripes';
    if (avgStdDev < 70) return 'Geometric';
    return 'Floral';
  } catch { return 'Unknown'; }
}

// POST /api/scan/analyze
router.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    const sharp = require('sharp');
    const { dominant } = await sharp(req.file.path).stats();
    const detectedColor = rgbToColorName(dominant.r, dominant.g, dominant.b);
    const detectedPattern = await detectPattern(req.file.path);

    const { hint_pattern, hint_material } = req.body;

    // Build textile search filter
    const filter = {};
    const orConditions = [];
    orConditions.push({ primary_color: { $regex: detectedColor, $options: 'i' } });
    if (hint_pattern) orConditions.push({ pattern: { $regex: hint_pattern, $options: 'i' } });
    if (hint_material) orConditions.push({ material: { $regex: hint_material, $options: 'i' } });
    if (orConditions.length > 0) filter.$or = orConditions;

    const matches = await Textile.find(filter).lean();

    // Score matches
    const scored = matches.map(t => {
      let score = 0;
      if (t.primary_color && t.primary_color.toLowerCase() === detectedColor) score += 40;
      if (t.pattern && detectedPattern !== 'Unknown' && t.pattern.toLowerCase().includes(detectedPattern.toLowerCase())) score += 30;
      if (hint_pattern && t.pattern && t.pattern.toLowerCase().includes(hint_pattern.toLowerCase())) score += 15;
      if (hint_material && t.material && t.material.toLowerCase().includes(hint_material.toLowerCase())) score += 15;
      return { ...t, id: t._id, match_score: Math.min(score, 100) };
    }).sort((a, b) => b.match_score - a.match_score).slice(0, 10);

    // Enrich with stock data
    const allStock = await Stock.find({ is_available: 1 }).lean();
    const allSuppliers = await Supplier.find({ is_active: 1 }).lean();
    const enriched = scored.map(t => ({
      ...t,
      in_stock: allStock.some(s => String(s.textile_id) === String(t._id)),
      total_stock: allStock.filter(s => String(s.textile_id) === String(t._id)).reduce((sum, s) => sum + (s.quantity_meters || 0), 0),
      supplier_count: new Set(allStock.filter(s => String(s.textile_id) === String(t._id)).map(s => String(s.supplier_id))).size,
    }));

    // Knowledge base matching
    const kb = await KnowledgeBase.find({ is_active: true }).lean();
    const kbMatches = kb.filter(k => {
      const colorMatch = k.typical_colors.some(c => c.toLowerCase().includes(detectedColor));
      const patternMatch = k.typical_patterns.some(p => p.toLowerCase().includes(detectedPattern.toLowerCase()));
      return colorMatch || patternMatch;
    }).map(k => ({
      textile_type: k.textile_type,
      origin: k.origin,
      material_category: k.material_category,
      identifying_features: k.identifying_features,
      confidence: (k.typical_colors.some(c => c.toLowerCase().includes(detectedColor)) ? 0.4 : 0) +
                  (k.typical_patterns.some(p => p.toLowerCase().includes(detectedPattern.toLowerCase())) ? 0.4 : 0.1),
    })).sort((a, b) => b.confidence - a.confidence).slice(0, 5);

    // Log scan
    await db.insert('scan_history', {
      image_path: `/uploads/scans/${req.file.filename}`,
      detected_color: detectedColor,
      detected_pattern: detectedPattern,
      dominant_rgb: `${dominant.r},${dominant.g},${dominant.b}`,
      matches_found: enriched.length,
      hint_pattern: hint_pattern || '',
      hint_material: hint_material || '',
    });

    res.json({
      scan: {
        detected_color: detectedColor,
        detected_pattern: detectedPattern,
        dominant_rgb: { r: dominant.r, g: dominant.g, b: dominant.b },
        image_url: `/uploads/scans/${req.file.filename}`,
      },
      matches: enriched,
      knowledge_matches: kbMatches,
      total_matches: enriched.length,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// GET /api/scan/history
router.get('/history', async (req, res) => {
  try {
    const history = await ScanHistory.find().sort({ scanned_at: -1 }).limit(50).lean();
    res.json(history.map(h => ({ ...h, id: h._id })));
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
