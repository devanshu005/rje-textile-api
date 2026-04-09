const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { Textile, Stock, KnowledgeBase } = require('../models/schemas');

const router = express.Router();

// Image upload
const uploadsDir = path.join(__dirname, '..', 'uploads', 'textiles');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `textile_${Date.now()}_${Math.round(Math.random() * 1E6)}${path.extname(file.originalname)}`)
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

// Match scanned image against knowledge base
async function matchKnowledge(detectedColor, detectedPattern) {
  const kb = await KnowledgeBase.find({ is_active: true }).lean();
  const matches = kb.filter(k => {
    const colorMatch = k.typical_colors.some(c => c.toLowerCase().includes(detectedColor) || detectedColor.includes(c.toLowerCase()));
    const patternMatch = k.typical_patterns.some(p => p.toLowerCase().includes(detectedPattern.toLowerCase()));
    return colorMatch || patternMatch;
  }).map(k => ({
    textile_type: k.textile_type,
    origin: k.origin,
    material_category: k.material_category,
    confidence: (k.typical_colors.some(c => c.toLowerCase().includes(detectedColor)) ? 0.4 : 0) +
                (k.typical_patterns.some(p => p.toLowerCase().includes(detectedPattern.toLowerCase())) ? 0.4 : 0.1),
    identifying_features: k.identifying_features,
  }));
  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

// POST /api/textiles/analyze-image
router.post('/analyze-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  try {
    const sharp = require('sharp');
    const { dominant } = await sharp(req.file.path).stats();
    const detectedColor = rgbToColorName(dominant.r, dominant.g, dominant.b);
    const detectedPattern = await detectPattern(req.file.path);

    const knowledgeMatches = await matchKnowledge(detectedColor, detectedPattern);

    const textiles = await Textile.find().lean();
    const patterns = [...new Set(textiles.map(t => t.pattern).filter(Boolean))].sort();
    const materials = [...new Set(textiles.map(t => t.material).filter(Boolean))].sort();
    const colors = [...new Set(textiles.map(t => t.primary_color).filter(Boolean))].sort();

    res.json({
      detected: { primary_color: detectedColor, dominant_rgb: { r: dominant.r, g: dominant.g, b: dominant.b }, pattern: detectedPattern },
      image_filename: req.file.filename,
      knowledge_matches: knowledgeMatches,
      recommendations: {
        patterns: patterns.length > 0 ? patterns : ['Plain', 'Stripes', 'Checks', 'Floral', 'Geometric', 'Abstract', 'Paisley'],
        materials: materials.length > 0 ? materials : ['Cotton', 'Silk', 'Polyester', 'Wool', 'Linen', 'Blended'],
        colors: colors.length > 0 ? colors : ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'white', 'black', 'brown'],
      },
    });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: 'Failed to analyze' });
  }
});

// POST /api/textiles/create-with-image
router.post('/create-with-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  const { name, description, primary_color, secondary_colors, pattern, material,
          weave_type, weight_gsm, width_inches, price_per_meter, tags, sku, origin_region } = req.body;
  if (!name || !primary_color || !pattern || !material) return res.status(400).json({ error: 'Name, color, pattern, material required' });

  try {
    const textile = await db.insert('textiles', {
      name, description: description || '', primary_color, secondary_colors: secondary_colors || '',
      pattern, material, weave_type: weave_type || '', origin_region: origin_region || '',
      weight_gsm: weight_gsm ? parseFloat(weight_gsm) : null,
      width_inches: width_inches ? parseFloat(width_inches) : null,
      price_per_meter: price_per_meter ? parseFloat(price_per_meter) : null,
      image_url: `/uploads/textiles/${req.file.filename}`, tags: tags || '', sku: sku || '',
    });
    res.status(201).json(textile);
  } catch (err) {
    console.error('Create error:', err);
    res.status(500).json({ error: 'Failed to create textile' });
  }
});

// GET /api/textiles
router.get('/', async (req, res) => {
  try {
    const { color, pattern, material, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (color) filter.primary_color = { $regex: color, $options: 'i' };
    if (pattern) filter.pattern = { $regex: pattern, $options: 'i' };
    if (material) filter.material = { $regex: material, $options: 'i' };
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
    ];

    const total = await Textile.countDocuments(filter);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const textiles = await Textile.find(filter).skip(skip).limit(parseInt(limit)).lean();

    // Add stock info
    const allStock = await Stock.find({ is_available: 1 }).lean();
    const enriched = textiles.map(t => ({
      ...t, id: t._id,
      total_stock: allStock.filter(s => String(s.textile_id) === String(t._id)).reduce((sum, s) => sum + (s.quantity_meters || 0), 0),
      supplier_count: new Set(allStock.filter(s => String(s.textile_id) === String(t._id)).map(s => String(s.supplier_id))).size,
    }));

    res.json({ textiles: enriched, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Failed to search textiles' });
  }
});

// GET /api/textiles/filters
router.get('/filters', async (req, res) => {
  try {
    const textiles = await Textile.find().lean();
    res.json({
      colors: [...new Set(textiles.map(t => t.primary_color).filter(Boolean))].sort(),
      patterns: [...new Set(textiles.map(t => t.pattern).filter(Boolean))].sort(),
      materials: [...new Set(textiles.map(t => t.material).filter(Boolean))].sort(),
    });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /api/textiles/:id
router.get('/:id', async (req, res) => {
  try {
    const textile = await Textile.findById(req.params.id).lean();
    if (!textile) return res.status(404).json({ error: 'Not found' });

    const { Supplier } = require('../models/schemas');
    const stockInfo = await Stock.find({ textile_id: textile._id, is_available: 1 }).lean();
    const suppliers = await Supplier.find({ is_active: 1 }).lean();

    const stock = stockInfo.map(s => {
      const sup = suppliers.find(sp => String(sp._id) === String(s.supplier_id));
      if (!sup) return null;
      return { ...s, supplier_name: sup.name, contact_person: sup.contact_person, email: sup.email, phone: sup.phone, city: sup.city, state: sup.state, rating: sup.rating };
    }).filter(Boolean).sort((a, b) => (a.price_per_meter || 0) - (b.price_per_meter || 0));

    res.json({ textile: { ...textile, id: textile._id }, stock });
  } catch (err) { res.status(500).json({ error: 'Failed to get textile' }); }
});

// POST /api/textiles
router.post('/', async (req, res) => {
  const { name, description, primary_color, secondary_colors, pattern, material, weave_type, weight_gsm, width_inches, price_per_meter, image_url, tags, sku } = req.body;
  if (!name || !primary_color || !pattern || !material) return res.status(400).json({ error: 'Name, color, pattern, material required' });
  try {
    const textile = await db.insert('textiles', { name, description, primary_color, secondary_colors, pattern, material, weave_type, weight_gsm, width_inches, price_per_meter, image_url, tags, sku });
    res.status(201).json(textile);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/textiles/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await Textile.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const fields = ['name', 'description', 'primary_color', 'secondary_colors', 'pattern', 'material', 'weave_type', 'weight_gsm', 'width_inches', 'price_per_meter', 'image_url', 'tags', 'sku'];
    const updates = {};
    for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
    const updated = await db.update('textiles', req.params.id, updates);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// DELETE /api/textiles/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.delete('textiles', req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
