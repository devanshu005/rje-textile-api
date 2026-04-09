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

const COLOR_MAP = {
  red:     [255, 0, 0],     crimson:  [220, 20, 60],   maroon:  [128, 0, 0],
  pink:    [255, 105, 180], coral:    [255, 127, 80],   orange:  [255, 165, 0],
  yellow:  [255, 255, 0],   gold:     [255, 215, 0],    mustard: [255, 219, 88],
  green:   [0, 128, 0],     olive:    [128, 128, 0],    teal:    [0, 128, 128],
  cyan:    [0, 188, 188],   blue:     [30, 80, 200],    navy:    [0, 0, 128],
  indigo:  [75, 0, 130],    purple:   [128, 0, 128],    wine:    [114, 47, 55],
  white:   [255, 255, 255], ivory:    [255, 255, 240],  cream:   [255, 253, 208],
  beige:   [245, 245, 220], honey:    [235, 177, 52],   khaki:   [189, 183, 107],
  grey:    [128, 128, 128], silver:   [192, 192, 192],  charcoal:[54, 69, 79],
  black:   [0, 0, 0],       brown:    [139, 69, 19],    tan:     [210, 180, 140],
};

function rgbToColorName(r, g, b) {
  let closest = 'white', minD = Infinity;
  for (const [name, [cr, cg, cb]] of Object.entries(COLOR_MAP)) {
    // Weighted distance — human eye is more sensitive to green
    const d = Math.sqrt(
      2 * (r - cr) ** 2 +
      4 * (g - cg) ** 2 +
      3 * (b - cb) ** 2
    );
    if (d < minD) { minD = d; closest = name; }
  }
  return closest;
}

// Convert RGB to HSL for better color analysis
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6;
    }
  }
  return [h * 360, s * 100, l * 100];
}

// Extract top N distinct colors from image using grid sampling
async function extractTopColors(imagePath, topN = 3) {
  const sharp = require('sharp');
  // Resize to small grid for fast processing
  const GRID = 20;
  const { data, info } = await sharp(imagePath)
    .resize(GRID, GRID, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Collect all pixel colors
  const pixels = [];
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Skip near-white backgrounds and very dark pixels
    const [, s, l] = rgbToHsl(r, g, b);
    pixels.push({ r, g, b, s, l });
  }

  // k-means style: bucket pixels into named colors and count
  const buckets = {};
  for (const px of pixels) {
    const name = rgbToColorName(px.r, px.g, px.b);
    if (!buckets[name]) buckets[name] = { count: 0, rSum: 0, gSum: 0, bSum: 0 };
    buckets[name].count++;
    buckets[name].rSum += px.r;
    buckets[name].gSum += px.g;
    buckets[name].bSum += px.b;
  }

  // Sort by frequency and return top N with their average RGB
  const sorted = Object.entries(buckets)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([name, v]) => ({
      name,
      r: Math.round(v.rSum / v.count),
      g: Math.round(v.gSum / v.count),
      b: Math.round(v.bSum / v.count),
      percentage: Math.round((v.count / pixels.length) * 100),
    }));

  return sorted;
}

// Detect pattern using directional variance analysis
async function detectPattern(imagePath) {
  try {
    const sharp = require('sharp');
    const SAMPLE = 64;
    const { data } = await sharp(imagePath)
      .resize(SAMPLE, SAMPLE, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Compute horizontal row variance (detects horizontal stripes)
    let hVar = 0;
    for (let y = 0; y < SAMPLE; y++) {
      let rowSum = 0, rowSumSq = 0;
      for (let x = 0; x < SAMPLE; x++) {
        const v = data[y * SAMPLE + x];
        rowSum += v; rowSumSq += v * v;
      }
      const mean = rowSum / SAMPLE;
      hVar += rowSumSq / SAMPLE - mean * mean;
    }
    hVar /= SAMPLE;

    // Compute vertical column variance (detects vertical stripes / checks)
    let vVar = 0;
    for (let x = 0; x < SAMPLE; x++) {
      let colSum = 0, colSumSq = 0;
      for (let y = 0; y < SAMPLE; y++) {
        const v = data[y * SAMPLE + x];
        colSum += v; colSumSq += v * v;
      }
      const mean = colSum / SAMPLE;
      vVar += colSumSq / SAMPLE - mean * mean;
    }
    vVar /= SAMPLE;

    const avgVar = (hVar + vVar) / 2;
    const hvRatio = Math.abs(hVar - vVar) / (avgVar + 1);

    if (avgVar < 100) return 'Plain';
    if (avgVar < 300) {
      if (hvRatio > 0.5) return hVar > vVar ? 'Horizontal Stripes' : 'Vertical Stripes';
      return 'Subtle';
    }
    if (avgVar < 700) {
      if (hvRatio > 0.4) return 'Stripes';
      return 'Checks';
    }
    if (avgVar < 1400) return 'Geometric';
    return 'Floral';
  } catch { return 'Unknown'; }
}

// POST /api/scan/analyze
router.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    // Extract top 3 colors + detect pattern
    const [topColors, detectedPattern] = await Promise.all([
      extractTopColors(req.file.path, 3),
      detectPattern(req.file.path),
    ]);

    const primaryColor = topColors[0]?.name || 'white';
    const allColorNames = topColors.map(c => c.name);

    const { hint_pattern, hint_material } = req.body;

    // Search textiles matching ANY of the top 3 colors, pattern, or hints
    const colorConditions = allColorNames.map(c => ({
      primary_color: { $regex: c, $options: 'i' }
    }));
    const orConditions = [
      ...colorConditions,
      { secondary_colors: { $in: allColorNames.map(c => new RegExp(c, 'i')) } },
    ];
    if (hint_pattern) orConditions.push({ pattern: { $regex: hint_pattern, $options: 'i' } });
    if (hint_material) orConditions.push({ material: { $regex: hint_material, $options: 'i' } });

    // Also get ALL textiles to score against pattern
    const [colorMatches, allTextiles] = await Promise.all([
      Textile.find({ $or: orConditions }).lean(),
      Textile.find({}).lean(),
    ]);

    // Pattern-only matches (not already in colorMatches)
    const colorMatchIds = new Set(colorMatches.map(t => String(t._id)));
    const patternStr = detectedPattern.toLowerCase();
    const patternMatches = allTextiles.filter(t =>
      !colorMatchIds.has(String(t._id)) &&
      t.pattern && t.pattern.toLowerCase().includes(patternStr)
    );

    const allMatches = [...colorMatches, ...patternMatches];

    // Advanced scoring
    const scored = allMatches.map(t => {
      let score = 0;
      const tColor = (t.primary_color || '').toLowerCase();
      const tPattern = (t.pattern || '').toLowerCase();
      const tMaterial = (t.material || '').toLowerCase();

      // Primary color match — weighted by how dominant it is in the image
      topColors.forEach((c, idx) => {
        const weight = idx === 0 ? 40 : idx === 1 ? 20 : 10;
        if (tColor === c.name || tColor.includes(c.name)) score += weight;
      });

      // Pattern match
      if (detectedPattern !== 'Unknown') {
        const patWords = patternStr.split(' ');
        if (patWords.some(w => tPattern.includes(w))) score += 25;
      }

      // User hint boosts
      if (hint_pattern && tPattern.includes(hint_pattern.toLowerCase())) score += 20;
      if (hint_material && tMaterial.includes(hint_material.toLowerCase())) score += 15;

      return { ...t, id: t._id, match_score: Math.min(score, 100) };
    })
    .filter(t => t.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 10);

    // Enrich with stock data
    const allStock = await Stock.find({ is_available: 1 }).lean();
    const enriched = scored.map(t => ({
      ...t,
      in_stock: allStock.some(s => String(s.textile_id) === String(t._id)),
      total_stock: allStock.filter(s => String(s.textile_id) === String(t._id)).reduce((sum, s) => sum + (s.quantity_meters || 0), 0),
      supplier_count: new Set(allStock.filter(s => String(s.textile_id) === String(t._id)).map(s => String(s.supplier_id))).size,
    }));

    // Knowledge base matching against all top colors
    const kb = await KnowledgeBase.find({ is_active: true }).lean();
    const kbMatches = kb.filter(k => {
      const colorMatch = k.typical_colors.some(c =>
        allColorNames.some(detected => c.toLowerCase().includes(detected))
      );
      const patternMatch = k.typical_patterns.some(p =>
        p.toLowerCase().includes(patternStr.split(' ')[0])
      );
      return colorMatch || patternMatch;
    }).map(k => ({
      textile_type: k.textile_type,
      origin: k.origin,
      material_category: k.material_category,
      identifying_features: k.identifying_features,
      confidence: (k.typical_colors.some(c => allColorNames.some(d => c.toLowerCase().includes(d))) ? 0.45 : 0) +
                  (k.typical_patterns.some(p => p.toLowerCase().includes(patternStr.split(' ')[0])) ? 0.45 : 0.1),
    })).sort((a, b) => b.confidence - a.confidence).slice(0, 5);

    // Log scan
    await ScanHistory.create({
      image_path: `/uploads/scans/${req.file.filename}`,
      detected_color: primaryColor,
      detected_pattern: detectedPattern,
      dominant_rgb: `${topColors[0]?.r},${topColors[0]?.g},${topColors[0]?.b}`,
      matches_found: enriched.length,
      hint_pattern: hint_pattern || '',
      hint_material: hint_material || '',
    });

    res.json({
      scan: {
        detected_colors: topColors,           // array of top 3 colors with %
        detected_color: primaryColor,         // primary (most dominant)
        detected_pattern: detectedPattern,
        dominant_rgb: { r: topColors[0]?.r || 128, g: topColors[0]?.g || 128, b: topColors[0]?.b || 128 },
        image_url: `/uploads/scans/${req.file.filename}`,
      },
      matches: enriched,
      knowledge_matches: kbMatches,
      total_matches: enriched.length,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Scan failed: ' + err.message });
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
