const express = require('express');
const { Order, CartItem, Textile, Notification, User } = require('../models/schemas');
const router = express.Router();

// Generate order number
function genOrderNumber() {
  const d = new Date();
  const prefix = 'RJE';
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${date}-${rand}`;
}

// POST /api/orders — Place order from cart
router.post('/', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.profile_completed) return res.status(400).json({ error: 'Please complete your profile before placing an order' });

    const cartItems = await CartItem.find({ user_id: req.user.userId }).lean();
    if (cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    const textileIds = cartItems.map(i => i.textile_id);
    const textiles = await Textile.find({ _id: { $in: textileIds } }).lean();
    const textileMap = {};
    textiles.forEach(t => { textileMap[String(t._id)] = t; });

    const items = cartItems.map(ci => {
      const t = textileMap[String(ci.textile_id)];
      const price = ci.price_per_meter || t?.price_per_meter || 0;
      return {
        textile_id: ci.textile_id,
        textile_name: t?.name || 'Unknown',
        meters: ci.meters,
        price_per_meter: price,
        total_price: ci.meters * price,
      };
    });

    const total_amount = items.reduce((sum, i) => sum + i.total_price, 0);

    const order = await Order.create({
      user_id: req.user.userId,
      order_number: genOrderNumber(),
      items,
      total_amount,
      status: 'pending',
      user_name: user.name,
      user_company: user.company_name || '',
      user_phone: user.phone,
      user_address: user.address || '',
      user_gst: user.gst_number || '',
    });

    // Clear cart
    await CartItem.deleteMany({ user_id: req.user.userId });

    // Notification to admin
    await Notification.create({
      user_id: null,
      type: 'admin_new_order',
      title: 'New Order Received',
      message: `Order ${order.order_number} from ${user.name} (${user.company_name || 'N/A'}) — ₹${total_amount}`,
      order_id: order._id,
    });

    // Notification to user
    await Notification.create({
      user_id: req.user.userId,
      type: 'order_placed',
      title: 'Order Placed',
      message: `Your order ${order.order_number} has been placed. Waiting for confirmation.`,
      order_id: order._id,
    });

    res.status(201).json({ order });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// GET /api/orders — Get user's orders
router.get('/', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    const orders = await Order.find({ user_id: req.user.userId }).sort({ createdAt: -1 }).lean();
    res.json({ orders: orders.map(o => ({ ...o, id: o._id })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/orders/:id — Get single order
router.get('/:id', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    const order = await Order.findOne({ _id: req.params.id, user_id: req.user.userId }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: { ...order, id: order._id } });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/orders/notifications/list — Get user notifications
router.get('/notifications/list', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    const notifications = await Notification.find({ user_id: req.user.userId }).sort({ createdAt: -1 }).limit(50).lean();
    const unread = await Notification.countDocuments({ user_id: req.user.userId, read: false });
    res.json({ notifications: notifications.map(n => ({ ...n, id: n._id })), unread });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/orders/notifications/read-all
router.put('/notifications/read-all', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    await Notification.updateMany({ user_id: req.user.userId, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
