const express = require('express');
const db = require('../database');
const { Stock, Textile, Supplier } = require('../models/schemas');

const router = express.Router();

// GET /api/stock
router.get('/', async (req, res) => {
  try {
    const { textile_id, supplier_id } = req.query;
    const filter = { is_available: 1 };
    if (textile_id) filter.textile_id = textile_id;
    if (supplier_id) filter.supplier_id = supplier_id;

    const stockList = await Stock.find(filter).lean();
    const textiles = await Textile.find().lean();
    const suppliers = await Supplier.find().lean();

    const enriched = stockList.map(s => {
      const t = textiles.find(tx => String(tx._id) === String(s.textile_id));
      const sup = suppliers.find(sp => String(sp._id) === String(s.supplier_id));
      return {
        ...s, id: s._id,
        textile_name: t ? t.name : 'Unknown',
        textile_color: t ? t.primary_color : '',
        textile_pattern: t ? t.pattern : '',
        supplier_name: sup ? sup.name : 'Unknown',
        supplier_city: sup ? sup.city : '',
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Stock error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/stock
router.post('/', async (req, res) => {
  const { textile_id, supplier_id, quantity_meters, min_order_meters, price_per_meter, lead_time_days } = req.body;
  if (!textile_id || !supplier_id) return res.status(400).json({ error: 'textile_id and supplier_id required' });

  try {
    // Check for duplicate
    const existing = await Stock.findOne({ textile_id, supplier_id, is_available: 1 });
    if (existing) return res.status(409).json({ error: 'Stock entry already exists for this textile-supplier pair. Use PUT to update.' });

    const stock = await db.insert('stock', {
      textile_id, supplier_id,
      quantity_meters: quantity_meters ? parseFloat(quantity_meters) : 0,
      min_order_meters: min_order_meters ? parseFloat(min_order_meters) : 1,
      price_per_meter: price_per_meter ? parseFloat(price_per_meter) : 0,
      lead_time_days: lead_time_days ? parseInt(lead_time_days) : 7,
    });
    res.status(201).json(stock);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /api/stock/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await Stock.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const fields = ['quantity_meters', 'min_order_meters', 'price_per_meter', 'lead_time_days', 'is_available'];
    const updates = {};
    for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
    const updated = await db.update('stock', req.params.id, updates);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// DELETE /api/stock/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.delete('stock', req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
