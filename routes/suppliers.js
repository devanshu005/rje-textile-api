const express = require('express');
const db = require('../database');
const { Supplier, Stock, Textile } = require('../models/schemas');

const router = express.Router();

// GET /api/suppliers
router.get('/', async (req, res) => {
  try {
    const { search, city, state } = req.query;
    const filter = { is_active: 1 };
    if (city) filter.city = { $regex: city, $options: 'i' };
    if (state) filter.state = { $regex: state, $options: 'i' };
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { contact_person: { $regex: search, $options: 'i' } },
      { city: { $regex: search, $options: 'i' } },
    ];

    const suppliers = await Supplier.find(filter).sort({ rating: -1 }).lean();

    // Add textile count per supplier
    const allStock = await Stock.find({ is_available: 1 }).lean();
    const enriched = suppliers.map(s => ({
      ...s, id: s._id,
      textile_count: new Set(allStock.filter(st => String(st.supplier_id) === String(s._id)).map(st => String(st.textile_id))).size,
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Suppliers error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id).lean();
    if (!supplier) return res.status(404).json({ error: 'Not found' });

    const stockInfo = await Stock.find({ supplier_id: supplier._id, is_available: 1 }).lean();
    const textiles = await Textile.find().lean();

    const stock = stockInfo.map(s => {
      const t = textiles.find(tx => String(tx._id) === String(s.textile_id));
      if (!t) return null;
      return { ...s, textile_name: t.name, primary_color: t.primary_color, pattern: t.pattern, material: t.material, image_url: t.image_url };
    }).filter(Boolean);

    res.json({ supplier: { ...supplier, id: supplier._id }, stock });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /api/suppliers
router.post('/', async (req, res) => {
  const { name, contact_person, email, phone, address, city, state, country, rating } = req.body;
  if (!name || !contact_person) return res.status(400).json({ error: 'Name and contact person required' });
  try {
    const supplier = await db.insert('suppliers', {
      name, contact_person, email: email || '', phone: phone || '',
      address: address || '', city: city || '', state: state || '', country: country || 'India',
      rating: rating ? parseFloat(rating) : 3.0,
    });
    res.status(201).json(supplier);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/suppliers/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await Supplier.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const fields = ['name', 'contact_person', 'email', 'phone', 'address', 'city', 'state', 'country', 'rating', 'is_active'];
    const updates = {};
    for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
    const updated = await db.update('suppliers', req.params.id, updates);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// DELETE /api/suppliers/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.delete('suppliers', req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
