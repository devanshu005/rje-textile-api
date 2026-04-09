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

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI AI VISION — Analyzes textile images for colors, patterns, style
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeWithGemini(imagePath, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    const prompt = `You are an expert textile analyst. Analyze this fabric/textile image and return a JSON object with these fields:
{
  "description": "2-3 sentence description of the textile/fabric including style, weave, and any design elements",
  "colors": ["color1", "color2", "color3"],
  "pattern": "the pattern type (e.g., Floral, Geometric, Stripes, Checks, Paisley, Abstract, Block Print, Brocade, Embroidered, Plain, Ikat, Batik, Tie-Dye, Damask, Jacquard, Solid)",
  "style": "the style (e.g., Traditional Indian, Modern, Ethnic, Contemporary, Vintage, Handloom, Machine-woven)",
  "material_guess": "likely material (e.g., Silk, Cotton, Polyester, Linen, Wool, Chiffon, Georgette, Velvet, Satin)",
  "textile_type": "the type of textile if recognizable (e.g., Banarasi, Kanjeevaram, Chanderi, Bandhani, Kalamkari, Ikat, Patola, Tussar, Chikankari, or Generic)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4"]
}
Return ONLY the JSON, no markdown, no explanation. Colors should be simple names like red, blue, gold, navy, maroon, green, cream, beige, pink, etc.`;

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
          generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini API error:', response.status, await response.text());
      return null;
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Extract JSON from response (handles markdown code blocks too)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('Gemini analysis:', parsed);
    return parsed;
  } catch (err) {
    console.error('Gemini analysis failed:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK: Color + pattern detection using sharp (no API key needed)
// ═══════════════════════════════════════════════════════════════════════════

const COLOR_MAP = {
  red: [255,0,0], crimson: [220,20,60], maroon: [128,0,0],
  pink: [255,105,180], coral: [255,127,80], orange: [255,165,0],
  yellow: [255,255,0], gold: [255,215,0], mustard: [255,219,88],
  green: [0,128,0], olive: [128,128,0], teal: [0,128,128],
  blue: [30,80,200], navy: [0,0,128], indigo: [75,0,130],
  purple: [128,0,128], wine: [114,47,55], white: [255,255,255],
  ivory: [255,255,240], cream: [255,253,208], beige: [245,245,220],
  grey: [128,128,128], silver: [192,192,192], charcoal: [54,69,79],
  black: [0,0,0], brown: [139,69,19], tan: [210,180,140],
};

function rgbToColorName(r, g, b) {
  let closest = 'white', minD = Infinity;
  for (const [name, [cr, cg, cb]] of Object.entries(COLOR_MAP)) {
    const d = Math.sqrt(2*(r-cr)**2 + 4*(g-cg)**2 + 3*(b-cb)**2);
    if (d < minD) { minD = d; closest = name; }
  }
  return closest;
}

async function extractTopColors(imagePath, topN = 3) {
  const sharp = require('sharp');
  const { data } = await sharp(imagePath)
    .resize(20, 20, { fit: 'fill' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = {};
  for (let i = 0; i < data.length; i += 3) {
    const name = rgbToColorName(data[i], data[i+1], data[i+2]);
    if (!buckets[name]) buckets[name] = { count: 0, rS: 0, gS: 0, bS: 0 };
    buckets[name].count++; buckets[name].rS += data[i]; buckets[name].gS += data[i+1]; buckets[name].bS += data[i+2];
  }
  const total = data.length / 3;
  return Object.entries(buckets)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([name, v]) => ({ name, r: Math.round(v.rS/v.count), g: Math.round(v.gS/v.count), b: Math.round(v.bS/v.count), percentage: Math.round(v.count/total*100) }));
}

// ═══════════════════════════════════════════════════════════════════════════
// SMART MATCHING — Uses AI context + colors + pattern to find best textiles
// ═══════════════════════════════════════════════════════════════════════════

function buildSearchQuery(colors, pattern, keywords, material, hints) {
  const orConditions = [];
  // Color matches
  colors.forEach(c => {
    orConditions.push({ primary_color: { $regex: c, $options: 'i' } });
    orConditions.push({ description: { $regex: c, $options: 'i' } });
  });
  // Pattern match
  if (pattern && pattern !== 'Unknown') {
    orConditions.push({ pattern: { $regex: pattern.split(' ')[0], $options: 'i' } });
    orConditions.push({ description: { $regex: pattern.split(' ')[0], $options: 'i' } });
  }
  // AI keywords
  if (keywords?.length) {
    keywords.forEach(kw => {
      orConditions.push({ name: { $regex: kw, $options: 'i' } });
      orConditions.push({ description: { $regex: kw, $options: 'i' } });
      orConditions.push({ material: { $regex: kw, $options: 'i' } });
    });
  }
  // Material
  if (material) {
    orConditions.push({ material: { $regex: material, $options: 'i' } });
  }
  // User hints
  if (hints?.pattern) orConditions.push({ pattern: { $regex: hints.pattern, $options: 'i' } });
  if (hints?.material) orConditions.push({ material: { $regex: hints.material, $options: 'i' } });

  return orConditions.length > 0 ? { $or: orConditions } : {};
}

function scoreTextile(textile, colors, pattern, keywords, material, aiDescription) {
  let score = 0;
  const tColor = (textile.primary_color || '').toLowerCase();
  const tPattern = (textile.pattern || '').toLowerCase();
  const tMaterial = (textile.material || '').toLowerCase();
  const tName = (textile.name || '').toLowerCase();
  const tDesc = (textile.description || '').toLowerCase();

  // Color scoring: primary=35, secondary=20, tertiary=10
  colors.forEach((c, i) => {
    const w = i === 0 ? 35 : i === 1 ? 20 : 10;
    if (tColor.includes(c) || tDesc.includes(c)) score += w;
  });

  // Pattern scoring
  if (pattern && pattern !== 'Unknown') {
    const pWords = pattern.toLowerCase().split(/[\s-]+/);
    pWords.forEach(pw => {
      if (tPattern.includes(pw)) score += 25;
      if (tDesc.includes(pw)) score += 10;
    });
  }

  // AI keywords scoring — context matching
  if (keywords?.length) {
    keywords.forEach(kw => {
      const kwl = kw.toLowerCase();
      if (tName.includes(kwl)) score += 15;
      if (tDesc.includes(kwl)) score += 10;
      if (tMaterial.includes(kwl)) score += 10;
      if (tPattern.includes(kwl)) score += 10;
    });
  }

  // Material match
  if (material && tMaterial.includes(material.toLowerCase())) score += 20;

  // AI description context matching
  if (aiDescription) {
    const descWords = aiDescription.toLowerCase().split(/\s+/);
    const nameWords = tName.split(/[\s-]+/);
    nameWords.forEach(nw => {
      if (nw.length > 3 && descWords.includes(nw)) score += 8;
    });
  }

  return Math.min(score, 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/scan/analyze — Main scan endpoint
// ═══════════════════════════════════════════════════════════════════════════

router.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    const mimeType = req.file.mimetype || 'image/jpeg';
    const { hint_pattern, hint_material } = req.body;

    // Run Gemini AI + color extraction in parallel
    const [geminiResult, topColors] = await Promise.all([
      analyzeWithGemini(req.file.path, mimeType),
      extractTopColors(req.file.path, 3),
    ]);

    // Use Gemini results if available, else fall back to pixel analysis
    const aiColors = geminiResult?.colors || topColors.map(c => c.name);
    const aiPattern = geminiResult?.pattern || 'Unknown';
    const aiKeywords = geminiResult?.keywords || [];
    const aiMaterial = geminiResult?.material_guess || null;
    const aiDescription = geminiResult?.description || null;
    const aiStyle = geminiResult?.style || null;
    const aiTextileType = geminiResult?.textile_type || null;

    // Search textiles using all AI context
    const query = buildSearchQuery(aiColors, aiPattern, aiKeywords, aiMaterial, {
      pattern: hint_pattern, material: hint_material
    });

    const candidates = await Textile.find(query).lean();

    // Score all candidates
    const scored = candidates.map(t => ({
      ...t,
      id: t._id,
      match_score: scoreTextile(t, aiColors, aiPattern, aiKeywords, aiMaterial, aiDescription),
    }))
    .filter(t => t.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 10);

    // Enrich with stock
    const allStock = await Stock.find({ is_available: 1 }).lean();
    const enriched = scored.map(t => ({
      ...t,
      in_stock: allStock.some(s => String(s.textile_id) === String(t._id)),
      total_stock: allStock.filter(s => String(s.textile_id) === String(t._id)).reduce((sum, s) => sum + (s.quantity_meters || 0), 0),
      supplier_count: new Set(allStock.filter(s => String(s.textile_id) === String(t._id)).map(s => String(s.supplier_id))).size,
    }));

    // Knowledge base
    const kb = await KnowledgeBase.find({ is_active: true }).lean();
    const kbMatches = kb.filter(k => {
      const colorMatch = k.typical_colors.some(c => aiColors.some(d => c.toLowerCase().includes(d.toLowerCase())));
      const patternMatch = k.typical_patterns.some(p => aiPattern.toLowerCase().includes(p.toLowerCase().split(' ')[0]));
      return colorMatch || patternMatch;
    }).map(k => ({
      textile_type: k.textile_type,
      origin: k.origin,
      material_category: k.material_category,
      identifying_features: k.identifying_features,
      confidence: (k.typical_colors.some(c => aiColors.some(d => c.toLowerCase().includes(d.toLowerCase()))) ? 0.45 : 0) +
                  (k.typical_patterns.some(p => aiPattern.toLowerCase().includes(p.toLowerCase().split(' ')[0])) ? 0.45 : 0.1),
    })).sort((a, b) => b.confidence - a.confidence).slice(0, 5);

    // Similar textiles — broader matches not in top results
    const matchedIds = new Set(enriched.map(t => String(t._id)));
    const allTextiles = await Textile.find({}).lean();
    const similar = allTextiles
      .filter(t => !matchedIds.has(String(t._id)))
      .map(t => ({
        ...t,
        id: t._id,
        match_score: scoreTextile(t, aiColors, 'Unknown', [], null, null),
        in_stock: allStock.some(s => String(s.textile_id) === String(t._id)),
        total_stock: allStock.filter(s => String(s.textile_id) === String(t._id)).reduce((sum, s) => sum + (s.quantity_meters || 0), 0),
      }))
      .filter(t => t.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 8);

    // Log scan
    await ScanHistory.create({
      image_path: `/uploads/scans/${req.file.filename}`,
      detected_color: aiColors[0] || 'unknown',
      detected_pattern: aiPattern,
      dominant_rgb: `${topColors[0]?.r || 0},${topColors[0]?.g || 0},${topColors[0]?.b || 0}`,
      matches_found: enriched.length,
      hint_pattern: hint_pattern || '',
      hint_material: hint_material || '',
    });

    res.json({
      scan: {
        ai_powered: !!geminiResult,
        description: aiDescription,
        detected_colors: topColors,
        ai_colors: aiColors,
        detected_color: aiColors[0] || 'unknown',
        detected_pattern: aiPattern,
        style: aiStyle,
        textile_type: aiTextileType,
        material_guess: aiMaterial,
        keywords: aiKeywords,
        dominant_rgb: { r: topColors[0]?.r || 128, g: topColors[0]?.g || 128, b: topColors[0]?.b || 128 },
        image_url: `/uploads/scans/${req.file.filename}`,
      },
      matches: enriched,
      similar,
      knowledge_matches: kbMatches,
      total_matches: enriched.length,
      total_similar: similar.length,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Scan failed: ' + err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/scan/filter-search — Re-search with user-modified filters
// ═══════════════════════════════════════════════════════════════════════════

router.post('/filter-search', async (req, res) => {
  try {
    const { colors = [], pattern, keywords = [], material, style, textile_type,
            add_colors = [], context_search, custom_pattern, design_type } = req.body;

    // Merge original + user-added colors
    const allColors = [...new Set([...colors, ...add_colors].map(c => c.toLowerCase()))];

    // Build query from active filters
    const query = buildSearchQuery(allColors, pattern || custom_pattern, keywords, material, {});

    // Also add style/textile_type to query
    if (style) {
      query.$or = query.$or || [];
      query.$or.push({ description: { $regex: style.split(' ')[0], $options: 'i' } });
    }
    if (textile_type && textile_type !== 'Generic') {
      query.$or = query.$or || [];
      query.$or.push({ name: { $regex: textile_type, $options: 'i' } });
      query.$or.push({ description: { $regex: textile_type, $options: 'i' } });
    }

    // Context search — free-text search across all fields
    if (context_search && context_search.trim()) {
      const words = context_search.trim().split(/\s+/).filter(w => w.length > 2);
      query.$or = query.$or || [];
      words.forEach(w => {
        query.$or.push({ name: { $regex: w, $options: 'i' } });
        query.$or.push({ description: { $regex: w, $options: 'i' } });
        query.$or.push({ tags: { $regex: w, $options: 'i' } });
        query.$or.push({ material: { $regex: w, $options: 'i' } });
        query.$or.push({ pattern: { $regex: w, $options: 'i' } });
        query.$or.push({ primary_color: { $regex: w, $options: 'i' } });
      });
    }

    // Design type — shape/drawing category
    if (design_type) {
      query.$or = query.$or || [];
      query.$or.push({ pattern: { $regex: design_type, $options: 'i' } });
      query.$or.push({ description: { $regex: design_type, $options: 'i' } });
      query.$or.push({ tags: { $regex: design_type, $options: 'i' } });
    }

    // Custom pattern override
    if (custom_pattern && custom_pattern !== pattern) {
      query.$or = query.$or || [];
      query.$or.push({ pattern: { $regex: custom_pattern, $options: 'i' } });
      query.$or.push({ description: { $regex: custom_pattern, $options: 'i' } });
    }

    const candidates = await Textile.find(Object.keys(query).length ? query : {}).lean();

    const scored = candidates.map(t => ({
      ...t,
      id: t._id,
      match_score: scoreTextile(t, allColors, pattern || 'Unknown', keywords, material, null),
    }))
    .filter(t => t.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 15);

    // Enrich with stock
    const allStock = await Stock.find({ is_available: 1 }).lean();
    const enriched = scored.map(t => ({
      ...t,
      in_stock: allStock.some(s => String(s.textile_id) === String(t._id)),
      total_stock: allStock.filter(s => String(s.textile_id) === String(t._id)).reduce((sum, s) => sum + (s.quantity_meters || 0), 0),
      supplier_count: new Set(allStock.filter(s => String(s.textile_id) === String(t._id)).map(s => String(s.supplier_id))).size,
    }));

    // Similar textiles — broader search with relaxed criteria (just colors/material)
    const similarQuery = { $or: [] };
    allColors.forEach(c => {
      similarQuery.$or.push({ primary_color: { $regex: c, $options: 'i' } });
    });
    if (material) similarQuery.$or.push({ material: { $regex: material, $options: 'i' } });
    if (similarQuery.$or.length === 0) delete similarQuery.$or;

    const matchedIds = new Set(enriched.map(t => String(t._id)));
    const similarCandidates = await Textile.find(Object.keys(similarQuery).length ? similarQuery : {}).lean();
    const similar = similarCandidates
      .filter(t => !matchedIds.has(String(t._id)))
      .map(t => ({
        ...t,
        id: t._id,
        match_score: scoreTextile(t, allColors, 'Unknown', [], null, null),
        in_stock: allStock.some(s => String(s.textile_id) === String(t._id)),
        total_stock: allStock.filter(s => String(s.textile_id) === String(t._id)).reduce((sum, s) => sum + (s.quantity_meters || 0), 0),
      }))
      .filter(t => t.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 8);

    res.json({
      matches: enriched,
      similar,
      total_matches: enriched.length,
      total_similar: similar.length,
      filters_applied: { colors: allColors, pattern, keywords, material, style, textile_type },
    });
  } catch (err) {
    console.error('Filter search error:', err);
    res.status(500).json({ error: 'Filter search failed: ' + err.message });
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
