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

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI AI — Full textile analysis for add-textile flow
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeImageWithGemini(imagePath, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    const prompt = `You are a professional textile industry expert with 20+ years. Examine ONLY the fabric/textile in this image. Ignore ALL non-fabric elements.

Return a JSON object:
{
  "description": "Detailed 2-3 sentence description of this fabric's appearance, texture, design, and craft technique",
  "primary_color": "dominant fabric color (e.g., red, blue, gold, navy, maroon, cream)",
  "secondary_colors": "other fabric colors comma-separated (e.g., gold, white, green)",
  "colors": ["primary_color", "secondary_color", "accent_color"],
  "pattern": "ONE of: Floral, Geometric, Stripes, Checks, Paisley, Abstract, Block Print, Brocade, Embroidered, Plain, Ikat, Batik, Tie-Dye, Damask, Jacquard, Solid, Polka Dots, Herringbone, Woven Motif, Zari Work, Printed",
  "material_guess": "ONE of: Silk, Cotton, Polyester, Linen, Wool, Chiffon, Georgette, Velvet, Satin, Denim, Rayon, Organza, Net, Crepe, Khadi",
  "weave_type": "weave type if visible (Plain Weave, Twill, Satin Weave, Dobby, Jacquard, Basket Weave, or N/A)",
  "style": "ONE of: Traditional Indian, Modern, Ethnic, Contemporary, Vintage, Handloom, Machine-woven",
  "textile_type": "If identifiable: Banarasi, Kanjeevaram, Chanderi, Bandhani, Kalamkari, Ikat, Patola, Tussar, Chikankari, or Generic",
  "suggested_name": "descriptive product name (e.g., Royal Blue Banarasi Silk Brocade)",
  "tags": "comma-separated tags (e.g., festive, bridal, premium, casual)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
  "origin_guess": "origin region if identifiable (Varanasi, Kanchipuram, Jaipur, or Unknown)"
}

COLOR RULES: List EXACT fabric colors only (not background). Minimum 2. Use common names: red, maroon, navy, gold, cream, beige, white, black, brown, teal, pink, mustard, etc.
Return ONLY valid JSON. No markdown. No backticks.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Image } }
            ]
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini API error:', response.status);
      return null;
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Gemini analyze failed:', err.message);
    return null;
  }
}

// Fallback: basic sharp detection
async function basicDetect(imagePath) {
  try {
    const sharp = require('sharp');
    const { dominant, channels } = await sharp(imagePath).stats();
    const colors = {
      red: [255,0,0], blue: [0,0,255], green: [0,128,0], yellow: [255,255,0],
      orange: [255,165,0], purple: [128,0,128], pink: [255,192,203], white: [255,255,255],
      black: [0,0,0], brown: [139,69,19], grey: [128,128,128], beige: [245,245,220],
      maroon: [128,0,0], navy: [0,0,128], teal: [0,128,128], gold: [255,215,0],
      coral: [255,127,80], cream: [255,253,208],
    };
    let closest = 'white', minD = Infinity;
    for (const [name, [cr, cg, cb]] of Object.entries(colors)) {
      const d = Math.sqrt((dominant.r-cr)**2 + (dominant.g-cg)**2 + (dominant.b-cb)**2);
      if (d < minD) { minD = d; closest = name; }
    }
    const avgStdDev = channels.reduce((s, c) => s + c.stdev, 0) / channels.length;
    let pattern = 'Plain';
    if (avgStdDev >= 70) pattern = 'Floral';
    else if (avgStdDev >= 50) pattern = 'Geometric';
    else if (avgStdDev >= 30) pattern = 'Stripes';
    else if (avgStdDev >= 15) pattern = 'Subtle';
    return { primary_color: closest, pattern, dominant_rgb: dominant };
  } catch { return { primary_color: 'white', pattern: 'Unknown', dominant_rgb: { r: 128, g: 128, b: 128 } }; }
}

// POST /api/textiles/analyze-image — now uses Gemini AI
router.post('/analyze-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  try {
    const mimeType = req.file.mimetype || 'image/jpeg';

    // Run Gemini + basic detection in parallel
    const [gemini, basic] = await Promise.all([
      analyzeImageWithGemini(req.file.path, mimeType),
      basicDetect(req.file.path),
    ]);

    const detected = {
      ai_powered: !!gemini,
      primary_color: gemini?.primary_color || basic.primary_color,
      secondary_colors: gemini?.secondary_colors || '',
      pattern: gemini?.pattern || basic.pattern,
      material_guess: gemini?.material_guess || null,
      weave_type: gemini?.weave_type || null,
      style: gemini?.style || null,
      textile_type: gemini?.textile_type || null,
      description: gemini?.description || null,
      suggested_name: gemini?.suggested_name || null,
      tags: gemini?.tags || '',
      keywords: gemini?.keywords || [],
      origin_guess: gemini?.origin_guess || null,
      colors: gemini?.colors || [basic.primary_color],
      dominant_rgb: basic.dominant_rgb,
    };

    // Get recommendations from existing DB
    const textiles = await Textile.find().lean();
    const patterns = [...new Set(textiles.map(t => t.pattern).filter(Boolean))].sort();
    const materials = [...new Set(textiles.map(t => t.material).filter(Boolean))].sort();
    const colors = [...new Set(textiles.map(t => t.primary_color).filter(Boolean))].sort();

    // Knowledge base matching
    const kb = await KnowledgeBase.find({ is_active: true }).lean();
    const kbMatches = kb.filter(k => {
      const colorMatch = k.typical_colors.some(c => (detected.primary_color || '').toLowerCase().includes(c.toLowerCase()));
      const patternMatch = k.typical_patterns.some(p => (detected.pattern || '').toLowerCase().includes(p.toLowerCase()));
      return colorMatch || patternMatch;
    }).map(k => ({
      textile_type: k.textile_type, origin: k.origin, material_category: k.material_category,
      identifying_features: k.identifying_features,
    })).slice(0, 5);

    res.json({
      detected,
      image_filename: req.file.filename,
      knowledge_matches: kbMatches,
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

// GET /api/textiles/materials — Material categories with counts
router.get('/materials', async (req, res) => {
  try {
    const result = await Textile.aggregate([
      { $group: { _id: '$material', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const materials = result.map(r => ({ name: r._id, count: r.count })).filter(m => m.name);
    res.json({ materials });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
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
