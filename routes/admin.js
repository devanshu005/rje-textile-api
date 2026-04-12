const express = require('express');
const db = require('../database');
const { Admin, Textile, Supplier, Stock, ScanHistory, KnowledgeBase, Order, Notification, User } = require('../models/schemas');

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

// GET /api/admin/textiles — with search/filter
router.get('/textiles', async (req, res) => {
  try {
    const { search, color, pattern, material } = req.query;
    const filter = {};
    if (color) filter.primary_color = { $regex: color, $options: 'i' };
    if (pattern) filter.pattern = { $regex: pattern, $options: 'i' };
    if (material) filter.material = { $regex: material, $options: 'i' };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }
    const textiles = await Textile.find(filter).sort({ createdAt: -1 }).lean();
    const allStock = await Stock.find({ is_available: 1 }).lean();
    const enriched = textiles.map(t => {
      const textileStock = allStock.filter(s => String(s.textile_id) === String(t._id));
      const supplierIds = [...new Set(textileStock.map(s => String(s.supplier_id)))];
      return {
        ...t, id: t._id,
        total_stock: textileStock.reduce((sum, s) => sum + (s.quantity_meters || 0), 0),
        supplier_ids: supplierIds,
        supplier_count: supplierIds.length,
      };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /api/admin/suppliers — with search
router.get('/suppliers', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { contact_person: { $regex: search, $options: 'i' } },
      ];
    }
    const suppliers = await Supplier.find(filter).sort({ name: 1 }).lean();
    const allStock = await Stock.find({ is_available: 1 }).lean();
    const enriched = suppliers.map(s => {
      const supplierStock = allStock.filter(st => String(st.supplier_id) === String(s._id));
      return {
        ...s, id: s._id,
        textile_ids: [...new Set(supplierStock.map(st => String(st.textile_id)))],
        textile_count: new Set(supplierStock.map(st => String(st.textile_id))).size,
      };
    });
    res.json(enriched);
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

// ═══════════════════════════════════════════════════════════════
// ORDER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// GET /api/admin/orders — All orders with filters
router.get('/orders', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { order_number: { $regex: search, $options: 'i' } },
        { user_name: { $regex: search, $options: 'i' } },
        { user_company: { $regex: search, $options: 'i' } },
        { user_phone: { $regex: search, $options: 'i' } },
      ];
    }
    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ orders: orders.map(o => ({ ...o, id: o._id })) });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/admin/orders/:id/accept — Accept order
router.put('/orders/:id/accept', async (req, res) => {
  try {
    const { delivery_date, admin_notes } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, {
      status: 'accepted',
      delivery_date: delivery_date ? new Date(delivery_date) : null,
      admin_notes: admin_notes || '',
    }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Notify user
    const deliveryMsg = delivery_date ? ` Expected delivery: ${new Date(delivery_date).toLocaleDateString('en-IN')}.` : '';
    await Notification.create({
      user_id: order.user_id,
      type: 'order_accepted',
      title: 'Order Confirmed!',
      message: `Your order ${order.order_number} has been accepted.${deliveryMsg}`,
      order_id: order._id,
    });

    res.json({ order });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/admin/orders/:id/reject — Reject order
router.put('/orders/:id/reject', async (req, res) => {
  try {
    const { admin_notes } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, {
      status: 'rejected',
      admin_notes: admin_notes || '',
    }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await Notification.create({
      user_id: order.user_id,
      type: 'order_rejected',
      title: 'Order Not Accepted',
      message: `Your order ${order.order_number} could not be processed. ${admin_notes || ''}`,
      order_id: order._id,
    });

    res.json({ order });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/admin/orders/:id/deliver — Mark as delivered
router.put('/orders/:id/deliver', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: 'delivered' }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await Notification.create({
      user_id: order.user_id,
      type: 'order_delivered',
      title: 'Order Delivered',
      message: `Your order ${order.order_number} has been delivered.`,
      order_id: order._id,
    });

    res.json({ order });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/admin/orders/:id/payment — Mark payment complete
router.put('/orders/:id/payment', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, { payment_status: 'completed' }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /api/admin/notifications — Admin notifications
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({ type: 'admin_new_order' }).sort({ createdAt: -1 }).limit(50).lean();
    const unread = await Notification.countDocuments({ type: 'admin_new_order', read: false });
    res.json({ notifications: notifications.map(n => ({ ...n, id: n._id })), unread });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/admin/notifications/read-all
router.put('/notifications/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ type: 'admin_new_order', read: false }, { read: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /api/admin/users — All registered users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json({ users: users.map(u => ({ ...u, id: u._id })) });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/admin/users/:id/verify — Mark user as verified (locks business fields)
router.put('/users/:id/verify', async (req, res) => {
  try {
    const admin = await Admin.findOne({ is_active: 1 });
    const verifiedBy = admin ? admin.username : 'admin';
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { is_verified: true, verified_at: new Date(), verified_by: verifiedBy },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user, message: 'User verified successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/admin/users/:id/unverify — Remove verification
router.put('/users/:id/unverify', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { is_verified: false, verified_at: null, verified_by: null },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user, message: 'Verification removed' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/admin/textiles/:id/suppliers — Link textile to suppliers
router.put('/textiles/:id/suppliers', async (req, res) => {
  try {
    const { supplier_ids } = req.body;
    if (!Array.isArray(supplier_ids)) return res.status(400).json({ error: 'supplier_ids array required' });
    const textile = await Textile.findById(req.params.id);
    if (!textile) return res.status(404).json({ error: 'Textile not found' });

    // Remove old stock links not in new list
    const existing = await Stock.find({ textile_id: req.params.id }).lean();
    for (const s of existing) {
      if (!supplier_ids.includes(String(s.supplier_id))) {
        await Stock.findByIdAndDelete(s._id);
      }
    }
    // Add new links
    for (const sid of supplier_ids) {
      const exists = await Stock.findOne({ textile_id: req.params.id, supplier_id: sid });
      if (!exists) {
        await Stock.create({
          textile_id: req.params.id,
          supplier_id: sid,
          quantity_meters: 0,
          min_order_meters: 20,
          price_per_meter: textile.price_per_meter || 0,
          is_available: 1,
        });
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
