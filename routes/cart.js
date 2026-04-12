const express = require('express');
const { CartItem, Textile } = require('../models/schemas');
const router = express.Router();

// GET /api/cart — Get user's cart
router.get('/', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    const items = await CartItem.find({ user_id: req.user.userId }).lean();
    const textileIds = items.map(i => i.textile_id);
    const textiles = await Textile.find({ _id: { $in: textileIds } }).lean();
    const textileMap = {};
    textiles.forEach(t => { textileMap[String(t._id)] = t; });

    const enriched = items.map(item => ({
      ...item, id: item._id,
      textile: textileMap[String(item.textile_id)] || null,
    }));

    const total = enriched.reduce((sum, i) => sum + (i.meters * (i.price_per_meter || 0)), 0);
    res.json({ items: enriched, total_amount: total, item_count: enriched.length });
  } catch (err) {
    console.error('Cart fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /api/cart/add — Add item to cart
router.post('/add', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    const { textile_id, meters } = req.body;
    if (!textile_id || !meters) return res.status(400).json({ error: 'textile_id and meters required' });
    if (meters < 20) return res.status(400).json({ error: 'Minimum order is 20 meters' });

    const textile = await Textile.findById(textile_id);
    if (!textile) return res.status(404).json({ error: 'Textile not found' });

    // Check if already in cart
    let item = await CartItem.findOne({ user_id: req.user.userId, textile_id });
    if (item) {
      item.meters = meters;
      item.price_per_meter = textile.price_per_meter || 0;
      await item.save();
    } else {
      item = await CartItem.create({
        user_id: req.user.userId,
        textile_id,
        meters,
        price_per_meter: textile.price_per_meter || 0,
      });
    }

    const count = await CartItem.countDocuments({ user_id: req.user.userId });
    res.json({ item, cart_count: count });
  } catch (err) {
    console.error('Cart add error:', err);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

// PUT /api/cart/:id — Update cart item meters
router.put('/:id', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    const { meters } = req.body;
    if (meters < 20) return res.status(400).json({ error: 'Minimum order is 20 meters' });

    const item = await CartItem.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.userId },
      { meters },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Cart item not found' });
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

// DELETE /api/cart/:id — Remove from cart
router.delete('/:id', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    await CartItem.findOneAndDelete({ _id: req.params.id, user_id: req.user.userId });
    const count = await CartItem.countDocuments({ user_id: req.user.userId });
    res.json({ success: true, cart_count: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove' });
  }
});

// DELETE /api/cart — Clear cart
router.delete('/', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    await CartItem.deleteMany({ user_id: req.user.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

module.exports = router;
