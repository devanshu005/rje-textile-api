const mongoose = require('mongoose');

// ─── Admin ──────────────────────────────────────────────
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: String,
  full_name: String,
  is_active: { type: Number, default: 1 },
}, { timestamps: true });

// ─── Textile ────────────────────────────────────────────
const textileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  primary_color: { type: String, required: true },
  secondary_colors: String,
  pattern: { type: String, required: true },
  material: { type: String, required: true },
  weave_type: String,
  weight_gsm: Number,
  width_inches: Number,
  price_per_meter: Number,
  image_url: String,
  tags: String,
  sku: String,
  origin_region: String,
}, { timestamps: true });

textileSchema.index({ primary_color: 1 });
textileSchema.index({ pattern: 1 });
textileSchema.index({ material: 1 });
textileSchema.index({ name: 'text', description: 'text', tags: 'text' });

// ─── Supplier ───────────────────────────────────────────
const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact_person: String,
  email: String,
  phone: String,
  address: String,
  city: String,
  state: String,
  country: { type: String, default: 'India' },
  website: String,
  rating: { type: Number, default: 0, min: 0, max: 5 },
  is_active: { type: Number, default: 1 },
}, { timestamps: true });

// ─── Stock ──────────────────────────────────────────────
const stockSchema = new mongoose.Schema({
  textile_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Textile', required: true },
  supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  quantity_meters: { type: Number, default: 0 },
  min_order_meters: { type: Number, default: 1 },
  price_per_meter: Number,
  lead_time_days: { type: Number, default: 7 },
  is_available: { type: Number, default: 1 },
}, { timestamps: true });

stockSchema.index({ textile_id: 1, supplier_id: 1 }, { unique: true });

// ─── Scan History ───────────────────────────────────────
const scanHistorySchema = new mongoose.Schema({
  user_session: String,
  image_path: String,
  detected_color: String,
  detected_pattern: String,
  detected_material: String,
  matched_textile_ids: String,
  confidence: Number,
}, { timestamps: true });

// ─── Knowledge Base (AI textile types) ──────────────────
const knowledgeBaseSchema = new mongoose.Schema({
  textile_type: { type: String, required: true, unique: true },
  origin: String,
  description: String,
  typical_colors: [String],
  typical_patterns: [String],
  material_category: String,
  identifying_features: String,
  texture_keywords: [String],
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

knowledgeBaseSchema.index({ textile_type: 'text', description: 'text', identifying_features: 'text' });

module.exports = {
  Admin: mongoose.model('Admin', adminSchema),
  Textile: mongoose.model('Textile', textileSchema),
  Supplier: mongoose.model('Supplier', supplierSchema),
  Stock: mongoose.model('Stock', stockSchema),
  ScanHistory: mongoose.model('ScanHistory', scanHistorySchema),
  KnowledgeBase: mongoose.model('KnowledgeBase', knowledgeBaseSchema),
};
