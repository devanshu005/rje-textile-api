const fs = require('fs');

// ═══════════════════════════════════════════════════════════════════════════
// Google Cloud Vision API — Precise color detection + label recognition
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze an image using Google Vision API.
 * Returns precise dominant colors, labels, and web entities.
 */
async function analyzeWithVision(imagePath) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey || apiKey === 'your-google-vision-api-key-here') return null;

  try {
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [
              { type: 'IMAGE_PROPERTIES', maxResults: 10 },
              { type: 'LABEL_DETECTION', maxResults: 15 },
              { type: 'WEB_DETECTION', maxResults: 5 },
            ],
          }],
        }),
      }
    );

    if (!response.ok) {
      console.error('Vision API error:', response.status, await response.text());
      return null;
    }

    const result = await response.json();
    const anno = result.responses?.[0];
    if (!anno) return null;

    // ── Extract dominant colors ──
    const visionColors = (anno.imagePropertiesAnnotation?.dominantColors?.colors || [])
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(c => ({
        r: Math.round(c.color?.red || 0),
        g: Math.round(c.color?.green || 0),
        b: Math.round(c.color?.blue || 0),
        hex: rgbToHex(c.color?.red || 0, c.color?.green || 0, c.color?.blue || 0),
        name: rgbToColorName(c.color?.red || 0, c.color?.green || 0, c.color?.blue || 0),
        percentage: Math.round((c.pixelFraction || 0) * 100),
        score: Math.round((c.score || 0) * 100),
      }));

    // ── Extract labels (objects / patterns / materials) ──
    const labels = (anno.labelAnnotations || [])
      .filter(l => l.score >= 0.5)
      .map(l => ({
        name: l.description,
        confidence: Math.round(l.score * 100),
      }));

    // ── Extract web entities (might identify textile types) ──
    const webEntities = (anno.webDetection?.webEntities || [])
      .filter(e => e.description && e.score >= 0.3)
      .map(e => ({
        name: e.description,
        score: Math.round(e.score * 100),
      }));

    return {
      colors: visionColors,
      labels,
      webEntities,
      primaryColor: visionColors[0]?.name || null,
      colorNames: [...new Set(visionColors.map(c => c.name))],
    };
  } catch (err) {
    console.error('Vision API failed:', err.message);
    return null;
  }
}

// ── Color name mapping ──────────────────────────────────────────────────
const COLOR_MAP = {
  red: [255,0,0], crimson: [220,20,60], maroon: [128,0,0],
  pink: [255,105,180], coral: [255,127,80], rose: [255,0,127],
  orange: [255,165,0], peach: [255,218,185],
  yellow: [255,255,0], gold: [255,215,0], mustard: [255,219,88],
  green: [0,128,0], olive: [128,128,0], teal: [0,128,128], emerald: [0,155,119],
  blue: [30,80,200], navy: [0,0,128], indigo: [75,0,130], turquoise: [0,206,209],
  purple: [128,0,128], lavender: [180,160,220], wine: [114,47,55], magenta: [255,0,255],
  white: [255,255,255], ivory: [255,255,240], cream: [255,253,208], beige: [245,245,220],
  grey: [128,128,128], silver: [192,192,192], charcoal: [54,69,79],
  black: [0,0,0], brown: [139,69,19], tan: [210,180,140], rust: [183,65,14],
};

function rgbToColorName(r, g, b) {
  let closest = 'white', minD = Infinity;
  for (const [name, [cr, cg, cb]] of Object.entries(COLOR_MAP)) {
    const d = Math.sqrt(2*(r-cr)**2 + 4*(g-cg)**2 + 3*(b-cb)**2);
    if (d < minD) { minD = d; closest = name; }
  }
  return closest;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('');
}

module.exports = { analyzeWithVision };
