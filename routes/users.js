const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../models/schemas');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'rje_textile_secret_key_2024';

// POST /api/users/google-login — Authenticate with Google ID token info
router.post('/google-login', async (req, res) => {
  try {
    const { google_id, email, name } = req.body;
    if (!google_id || !name) return res.status(400).json({ error: 'google_id and name required' });

    let user = await User.findOne({ google_id });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      user = await User.create({ google_id, email, name, phone: '', profile_completed: false });
    } else {
      if (!user.google_id) user.google_id = google_id;
      if (email && !user.email) user.email = email;
      await user.save();
    }

    const token = jwt.sign({ userId: user._id, type: 'user' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user, profile_completed: user.profile_completed });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/users/phone-login — Sign in (existing) or sign up (new)
// Body: { phone, name? (required only for new users) }
// Response: { token, user, is_new_user }
//   OR if new user and no name provided: { is_new_user: true } (status 200, no token)
router.post('/phone-login', async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    let user = await User.findOne({ phone: { $in: [cleanPhone, phone] } });

    if (!user) {
      // New user — name is required to create account
      if (!name || !name.trim()) {
        return res.status(200).json({ is_new_user: true });
      }
      user = await User.create({ name: name.trim(), phone: cleanPhone, profile_completed: false });
    }

    const token = jwt.sign({ userId: user._id, type: 'user' }, JWT_SECRET, { expiresIn: '365d' });
    res.json({ token, user, is_new_user: false });
  } catch (err) {
    console.error('Phone login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// PUT /api/users/profile — Complete/update user profile
// VERIFIED users: only name and address can change.
// Locked fields when verified: company_name, gst_number, phone, email
router.put('/profile', async (req, res) => {
  try {
    const { name, company_name, phone, gst_number, address, email } = req.body;
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });

    const existing = await User.findById(req.user.userId);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const update = {};

    if (existing.is_verified) {
      // Locked fields — only name and address can be updated
      if (name && name.trim()) update.name = name.trim();
      if (address !== undefined) update.address = address;

      // Reject attempts to change locked fields
      if (company_name !== undefined && company_name !== existing.company_name) {
        return res.status(403).json({ error: 'Account is verified. Company name cannot be changed.', locked: true });
      }
      if (gst_number !== undefined && gst_number !== existing.gst_number) {
        return res.status(403).json({ error: 'Account is verified. GST number cannot be changed.', locked: true });
      }
      if (phone && phone !== existing.phone) {
        return res.status(403).json({ error: 'Account is verified. Phone cannot be changed.', locked: true });
      }
      if (email !== undefined && email !== existing.email) {
        return res.status(403).json({ error: 'Account is verified. Email cannot be changed.', locked: true });
      }
    } else {
      // Not verified — all fields editable
      if (name && name.trim()) update.name = name.trim();
      if (company_name !== undefined) update.company_name = company_name;
      if (phone) update.phone = phone;
      if (gst_number !== undefined) update.gst_number = gst_number;
      if (address !== undefined) update.address = address;
      if (email !== undefined) update.email = email;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No changes to save' });
    }

    // Mark profile completed if key fields are filled
    const merged = { ...existing.toObject(), ...update };
    if (merged.name && merged.company_name && merged.phone) update.profile_completed = true;

    const user = await User.findByIdAndUpdate(req.user.userId, update, { new: true });
    res.json({ user });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/users/me — Get current user
router.get('/me', async (req, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Login required' });
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
