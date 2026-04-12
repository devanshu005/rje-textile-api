const mongoose = require('mongoose');

// ─── Admin ──────────────────────────────────────────────
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: String,
  full_name: String,
  is_active: { type: Number, default: 1 },
}, { timestamps: true });

// ─── User (Customer) ───────────────────────────────────
const userSchema = new mongoose.Schema({
  google_id: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  name: { type: String, required: true },
  company_name: String,
  phone: { type: String, required: true },
  gst_number: String,
  address: String,
  profile_completed: { type: Boolean, default: false },
  is_verified: { type: Boolean, default: false },
  verified_at: Date,
  verified_by: String,
}, { timestamps: true });

userSchema.index({ phone: 1 });
userSchema.index({ email: 1 });

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
  min_order_meters: { type: Number, default: 20 },
  price_per_meter: Number,
  lead_time_days: { type: Number, default: 7 },
  is_available: { type: Number, default: 1 },
}, { timestamps: true });

stockSchema.index({ textile_id: 1, supplier_id: 1 }, { unique: true });

// ─── Cart ───────────────────────────────────────────────
const cartItemSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  textile_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Textile', required: true },
  meters: { type: Number, required: true, min: 20 },
  price_per_meter: Number,
}, { timestamps: true });

cartItemSchema.index({ user_id: 1 });

// ─── Order ──────────────────────────────────────────────
const orderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order_number: { type: String, unique: true },
  items: [{
    textile_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Textile' },
    textile_name: String,
    meters: Number,
    price_per_meter: Number,
    total_price: Number,
  }],
  total_amount: Number,
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'delivered', 'cancelled'], default: 'pending' },
  delivery_date: Date,
  payment_status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  admin_notes: String,
  user_name: String,
  user_company: String,
  user_phone: String,
  user_address: String,
  user_gst: String,
}, { timestamps: true });

orderSchema.index({ user_id: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ order_number: 1 });

// ─── Notification ───────────────────────────────────────
const notificationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['order_placed', 'order_accepted', 'order_rejected', 'order_delivered', 'admin_new_order'], required: true },
  title: String,
  message: String,
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  read: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ user_id: 1, read: 1 });

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
  User: mongoose.model('User', userSchema),
  Textile: mongoose.model('Textile', textileSchema),
  Supplier: mongoose.model('Supplier', supplierSchema),
  Stock: mongoose.model('Stock', stockSchema),
  CartItem: mongoose.model('CartItem', cartItemSchema),
  Order: mongoose.model('Order', orderSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  ScanHistory: mongoose.model('ScanHistory', scanHistorySchema),
  KnowledgeBase: mongoose.model('KnowledgeBase', knowledgeBaseSchema),
};
