const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ============ MULTER SETUP ============
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files allowed'));
  }
});

const uploadNoteFile = multer({
  storage: videoStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','application/rtf','image/jpeg','image/png','image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, DOCX, TXT, RTF, JPG, PNG allowed'));
  }
});

const ADMIN_RESET_CODE = '100510';
const ADMIN_EMAIL = 'teshomeayenew883@gmail.com';

// ============ AUTH ============
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const referralCode = 'REF-' + email.split('@')[0].toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  try {
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(400).json({ error: 'Account already exists' });
    const { data, error } = await supabase.from('users')
      .insert([{ email, password, referral_code: referralCode, role: 'user', status: 'active' }]).select();
    if (error) throw error;
    res.status(201).json({ message: 'Registered', user: data[0] });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (!user) return res.status(401).json({ error: '❌ No account found.' });
    if (user.status === 'banned') return res.status(403).json({ error: '🚫 Banned.' });
    if (user.password !== password) return res.status(401).json({ error: '❌ Incorrect password.' });
    res.json({ message: 'Login OK', user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/admin-reset', async (req, res) => {
  const { email, newPassword, code } = req.body;
  if (!email || !newPassword || !code) return res.status(400).json({ error: 'Missing fields' });
  if (code !== ADMIN_RESET_CODE) return res.status(403).json({ error: '❌ Invalid secret code' });
  if (email !== ADMIN_EMAIL) return res.status(403).json({ error: '❌ Only admin' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password 6+ chars' });
  const { error } = await supabase.from('users').update({ password: newPassword }).eq('email', email);
  if (error) return res.status(500).json({ error: error.message });
  await supabase.from('admin_password_resets').insert([{ admin_email: email, new_password: newPassword }]);
  res.json({ message: '✅ Admin password reset.' });
});

// ============ PASSWORD RESET ============
app.post('/api/password-reset/request', async (req, res) => {
  const { email, reason } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const { data: user } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (!user) return res.status(404).json({ error: 'No account found' });
  const { data: existing } = await supabase.from('password_reset_requests')
    .select('id').eq('user_email', email).eq('status', 'pending').maybeSingle();
  if (existing) return res.status(400).json({ error: 'Already pending' });
  await supabase.from('password_reset_requests').insert([{ user_email: email, reason: reason || 'Forgot password' }]);
  res.json({ message: 'Request submitted' });
});

app.get('/api/password-reset', async (req, res) => {
  const { data, error } = await supabase.from('password_reset_requests').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/password-reset/:id/reset', async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const { data: request } = await supabase.from('password_reset_requests').select('*').eq('id', id).single();
  if (!request) return res.status(404).json({ error: 'Not found' });
  await supabase.from('users').update({ password: newPassword }).eq('email', request.user_email);
  await supabase.from('password_reset_requests')
    .update({ status: 'resolved', new_password: newPassword, resolved_at: new Date().toISOString() }).eq('id', id);
  res.json({ message: 'Reset done' });
});

app.delete('/api/password-reset/:id', async (req, res) => {
  const { error } = await supabase.from('password_reset_requests').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Dismissed' });
});

// ============ UPLOADS ============
app.post('/api/upload-video', uploadVideo.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video uploaded' });
  res.json({ url: '/uploads/' + req.file.filename, filename: req.file.filename });
});

app.post('/api/upload-note', uploadNoteFile.single('notefile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: '/uploads/' + req.file.filename, filename: req.file.filename, originalName: req.file.originalname });
});

// ============ COURSES ============
app.get('/api/courses', async (req, res) => {
  const { data, error } = await supabase.from('courses').select('*').order('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/courses', async (req, res) => {
  const { name, price, type, format, note_text, video_url, description, course_tag, category, sub_category, note_file_url, note_file_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const { data, error } = await supabase.from('courses').insert([{
    name, price: price || 0, type: type || 'locked',
    format: format || 'video',
    note_text: note_text || null,
    video_url: video_url || null,
    note_file_url: note_file_url || null,
    note_file_name: note_file_name || null,
    description: description || null,
    course_tag: course_tag || null,
    category: category || null,
    sub_category: sub_category || null,
    locked: type === 'locked',
    locked_for_all: type === 'locked'
  }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.put('/api/courses/:id', async (req, res) => {
  const { data, error } = await supabase.from('courses').update(req.body).eq('id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/api/courses/:id', async (req, res) => {
  const { error } = await supabase.from('courses').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Deleted' });
});

app.post('/api/courses/:id/lock-all', async (req, res) => {
  const { locked } = req.body;
  const { data, error } = await supabase.from('courses')
    .update({ locked, locked_for_all: locked }).eq('id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.post('/api/courses/:id/user-access', async (req, res) => {
  const { id } = req.params;
  const { userEmail, hasAccess } = req.body;
  if (!userEmail) return res.status(400).json({ error: 'userEmail required' });
  const { data: existing } = await supabase.from('user_course_access')
    .select('*').eq('user_email', userEmail).eq('course_id', id).maybeSingle();
  if (existing) {
    const { data, error } = await supabase.from('user_course_access')
      .update({ has_access: hasAccess }).eq('id', existing.id).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data[0]);
  }
  const { data, error } = await supabase.from('user_course_access')
    .insert([{ user_email: userEmail, course_id: id, has_access: hasAccess }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.get('/api/user-access/:email', async (req, res) => {
  const { data, error } = await supabase.from('user_course_access')
    .select('course_id, has_access').eq('user_email', req.params.email);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============ PRODUCTS ============
app.get('/api/products', async (req, res) => {
  const { data, error } = await supabase.from('products').select('*').order('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/products', async (req, res) => {
  const { name, price, description, product_link, image_url, category } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const { data, error } = await supabase.from('products').insert([{
    name, price: price || 0, description: description || '',
    product_link: product_link || '', image_url: image_url || '', category: category || 'other'
  }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/api/products/:id', async (req, res) => {
  const { error } = await supabase.from('products').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Deleted' });
});

// ============ PRODUCT REQUESTS ============
app.post('/api/product-requests', async (req, res) => {
  const { product_id, product_name, user_email, user_name, message } = req.body;
  const { data, error } = await supabase.from('product_requests')
    .insert([{ product_id, product_name, user_email, user_name, message }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.get('/api/product-requests', async (req, res) => {
  const { data, error } = await supabase.from('product_requests').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============ DEPOSITS ============
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

app.post('/api/deposits/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  if (!comment || comment.trim() === '') return res.status(400).json({ error: 'Comment required' });
  const { data, error } = await supabase.from('deposits').update({
    status: 'approved', admin_comment: comment,
    reviewed_at: new Date().toISOString(), reviewed_by: ADMIN_EMAIL
  }).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.post('/api/deposits/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  if (!comment || comment.trim() === '') return res.status(400).json({ error: 'Comment required' });
  const { data, error } = await supabase.from('deposits').update({
    status: 'rejected', admin_comment: comment,
    reviewed_at: new Date().toISOString(), reviewed_by: ADMIN_EMAIL
  }).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// ============ ORDERS ============
app.post('/api/orders', async (req, res) => {
  const { email, name, description } = req.body;
  const { data, error } = await supabase.from('orders')
    .insert([{ user_email: email, name, description }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.get('/api/orders', async (req, res) => {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============ USERS ============
app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('id, email, password, role, status, referral_code');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/users/:id/reset-password', async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password 6+ chars' });
  const { data, error } = await supabase.from('users').update({ password: newPassword }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Updated', user: data });
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));