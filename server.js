const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

// ==================== AUTH ====================
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const referralCode = 'REF-' + email.split('@')[0].toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  try {
    const { data, error } = await supabase.from('users')
      .insert([{ email, password, referral_code: referralCode, role: 'user', status: 'active' }])
      .select();
    if (error) throw error;
    res.status(201).json({ message: 'Registered', user: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.from('users')
      .select('*').eq('email', email).eq('password', password).single();
    if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });
    if (data.status === 'banned') return res.status(403).json({ error: 'Account banned' });
    res.json({ message: 'Login OK', user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== COURSES ====================
app.get('/api/courses', async (req, res) => {
  const { data, error } = await supabase.from('courses').select('*').order('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/courses', async (req, res) => {
  const { name, price, type } = req.body;
  const { data, error } = await supabase.from('courses')
    .insert([{ name, price, type, locked: type === 'locked' }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// ==================== VIDEOS ====================
app.get('/api/videos/:courseName', async (req, res) => {
  const { data, error } = await supabase.from('videos').select('*').eq('course_name', req.params.courseName);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/videos', upload.single('video'), async (req, res) => {
  const { courseName, title, url } = req.body;
  let videoUrl = url;
  if (req.file) videoUrl = `https://your-storage.supabase.co/${req.file.originalname}`;
  const { data, error } = await supabase.from('videos')
    .insert([{ course_name: courseName, title, url: videoUrl, type: 'locked' }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// ==================== PRODUCTS ====================
app.get('/api/products', async (req, res) => {
  const { data, error } = await supabase.from('products').select('*').order('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/products', async (req, res) => {
  const { name, price, description } = req.body;
  const { data, error } = await supabase.from('products').insert([{ name, price, description }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// ==================== DEPOSITS ====================
app.post('/api/deposits', async (req, res) => {
  const { email, amount, transactionId, description } = req.body;
  const { data, error } = await supabase.from('deposits')
    .insert([{ user_email: email, amount, transaction_id: transactionId, description }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.get('/api/deposits', async (req, res) => {
  const { data, error } = await supabase.from('deposits').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ==================== ORDERS ====================
app.post('/api/orders', async (req, res) => {
  const { email, name, description, amount, transactionId } = req.body;
  const { data, error } = await supabase.from('orders')
    .insert([{ user_email: email, name, description, amount, transaction_id: transactionId }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.get('/api/orders', async (req, res) => {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));