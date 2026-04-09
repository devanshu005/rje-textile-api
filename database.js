const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']); // Use Google/Cloudflare DNS for SRV record resolution

const mongoose = require('mongoose');
const { Admin, Textile, Supplier, Stock, ScanHistory, KnowledgeBase } = require('./models/schemas');

const MODELS = { admins: Admin, textiles: Textile, suppliers: Supplier, stock: Stock, scan_history: ScanHistory, knowledge_base: KnowledgeBase };

let connected = false;

async function connectDB() {
  if (connected) return;
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rje_textiles';
  await mongoose.connect(uri);
  connected = true;
  console.log('✅ Connected to MongoDB');
}

// Compatibility layer — same interface as old JSON db
const db = {
  async connect() { await connectDB(); },

  async getAll(table) {
    return (await MODELS[table].find().lean()) || [];
  },

  async getById(table, id) {
    return await MODELS[table].findById(id).lean();
  },

  async find(table, query) {
    // query can be a MongoDB filter object
    return await MODELS[table].find(query).lean();
  },

  async findOne(table, query) {
    return await MODELS[table].findOne(query).lean();
  },

  async insert(table, record) {
    const doc = new MODELS[table](record);
    await doc.save();
    return doc.toObject();
  },

  async update(table, id, updates) {
    return await MODELS[table].findByIdAndUpdate(id, { ...updates, updatedAt: new Date() }, { new: true }).lean();
  },

  async delete(table, id) {
    const result = await MODELS[table].findByIdAndDelete(id);
    if (!result) return false;
    if (table === 'textiles') await Stock.deleteMany({ textile_id: id });
    if (table === 'suppliers') await Stock.deleteMany({ supplier_id: id });
    return true;
  },

  async count(table, query = {}) {
    return await MODELS[table].countDocuments(query);
  },

  async search(table, searchText) {
    return await MODELS[table].find({ $text: { $search: searchText } }).lean();
  },
};

module.exports = db;
