const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    const admin = await db.findOne('admins', { username, is_active: 1 });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: admin._id, username: admin.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, admin: { id: admin._id, username: admin.username, full_name: admin.full_name } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Min 6 characters' });

    const admin = await db.getById('admins', req.admin.id);
    if (!bcrypt.compareSync(currentPassword, admin.password)) return res.status(401).json({ error: 'Wrong current password' });

    await db.update('admins', admin._id, { password: bcrypt.hashSync(newPassword, 10) });
    res.json({ message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
