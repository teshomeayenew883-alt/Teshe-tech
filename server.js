const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const uploadNote = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const ADMIN_RESET_CODE = '100510';
const ADMIN_EMAIL = 'teshomeayenew883@gmail.com';

/* ============ HELPER: Activate Referral ============ */
async function activateReferral(userEmail) {
  try {
    const { data: ref } = await supabase.from('referrals')
      .select('*').eq('referred_email', userEmail).eq('status', 'pending').maybeSingle();
    if (!ref) return; // not a referred user, or already active

    await supabase.from('referrals').update({ status: 'active' }).eq('id', ref.id);

    // Count ACTIVE referrals for the referrer
    const { data: activeRefs } = await supabase.from('referrals')
      .select('id').eq('referrer_email', ref.referrer_email).eq('status', 'active');
    const count = activeRefs?.length || 0;

    const { data: goalSetting } = await supabase.from('settings')
      .select('setting_value').eq('setting_key', 'referral_goal').maybeSingle();
    const goal = parseInt(goalSetting?.setting_value || '5');

    if (count >= goal) {
      // Award credit
      const { data: credit } = await supabase.from('free_credits')
        .select('*').eq('user_email', ref.referrer_email).maybeSingle();
      if (credit) {
        await supabase.from('free_credits')
          .update({ credits: credit.credits + 1, updated_at: new Date().toISOString() }).eq('id', credit.id);
      } else {
        await supabase.from('free_credits')
          .insert([{ user_email: ref.referrer_email, credits: 1 }]);
      }
      // Reset — delete only active ones so pending stay
      await supabase.from('referrals')
        .delete().eq('referrer_email', ref.referrer_email).eq('status', 'active');
    }
  } catch (err) { console.error('Activate referral error:', err); }
}

/* ============ AUTH ============ */
app.post('/api/auth/register', async (req, res) => {
  const { email, password, referralCode } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const myReferralCode = 'REF-' + email.split('@')[0].toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  try {
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(400).json({ error: 'Account already exists' });

    const { data, error } = await supabase.from('users')
      .insert([{ email, password, referral_code: myReferralCode, role: 'user', status: 'active' }]).select();
    if (error) throw error;

    // Handle referral (creates a PENDING referral — activates later)
    if (referralCode) {
      let referrerEmail = null;
      if (referralCode.includes('@')) {
        referrerEmail = referralCode;
      } else {
        const { data: referrer } = await supabase.from('users')
          .select('email').eq('referral_code', referralCode).maybeSingle();
        if (referrer) referrerEmail = referrer.email;
      }

      if (referrerEmail && referrerEmail !== email) {
        const { data: already } = await supabase.from('referrals')
          .select('id').eq('referred_email', email).maybeSingle();
        if (!already) {
          await supabase.from('referrals').insert([{
            referrer_email: referrerEmail,
            referred_email: email,
            status: 'pending'
          }]);
        }
      }
    }

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

/* ============ PASSWORD RESET ============ */
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

/* ============ FILE UPLOADS ============ */
app.post('/api/upload-video', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video uploaded' });
  try {
    const filename = `videos/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('uploads').upload(filename, req.file.buffer, {
      contentType: req.file.mimetype, upsert: false
    });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filename);
    res.json({ url: urlData.publicUrl, filename });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/upload-note', uploadNote.single('notefile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const filename = `notes/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('uploads').upload(filename, req.file.buffer, {
      contentType: req.file.mimetype, upsert: false
    });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filename);
    res.json({ url: urlData.publicUrl, filename, originalName: req.file.originalname });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/upload-receipt', uploadNote.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No receipt uploaded' });
  try {
    const filename = `receipts/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('uploads').upload(filename, req.file.buffer, {
      contentType: req.file.mimetype, upsert: false
    });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filename);
    res.json({ url: urlData.publicUrl, filename, originalName: req.file.originalname });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============ COURSES ============ */
app.get('/api/courses', async (req, res) => {
  const { data, error } = await supabase.from('courses').select('*').order('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/courses', async (req, res) => {
  const { name, price, type, format, note_text, video_url, description, course_tag, category, sub_category, note_file_url, note_file_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const { data, error } = await supabase.from('courses').insert([{
    name, price: price || 0, type: type || 'locked', format: format || 'video',
    note_text: note_text || null, video_url: video_url || null,
    note_file_url: note_file_url || null, note_file_name: note_file_name || null,
    description: description || null, course_tag: course_tag || null,
    category: category || null, sub_category: sub_category || null,
    locked: type === 'locked', locked_for_all: type === 'locked'
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
  const { data, error } = await supabase.from('courses').update({ locked, locked_for_all: locked }).eq('id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.post('/api/courses/:id/user-access', async (req, res) => {
  const { id } = req.params;
  const { userEmail, hasAccess } = req.body;
  if (!userEmail) return res.status(400).json({ error: 'userEmail required' });
  const { data: existing } = await supabase.from('user_course_access').select('*').eq('user_email', userEmail).eq('course_id', id).maybeSingle();
  if (existing) {
    const { data, error } = await supabase.from('user_course_access').update({ has_access: hasAccess }).eq('id', existing.id).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data[0]);
  }
  const { data, error } = await supabase.from('user_course_access').insert([{ user_email: userEmail, course_id: id, has_access: hasAccess }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.get('/api/user-access/:email', async (req, res) => {
  const { data, error } = await supabase.from('user_course_access').select('course_id, has_access').eq('user_email', req.params.email);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* ============ PRODUCTS ============ */
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

/* ============ PRODUCT REQUESTS ============ */
app.post('/api/product-requests', async (req, res) => {
  const { product_id, product_name, user_email, user_name, message } = req.body;
  const { data, error } = await supabase.from('product_requests').insert([{ product_id, product_name, user_email, user_name, message }]).select();
  if (error) return res.status(500).json({ error: error.message });

  // ✅ Activate referral (a buy request counts as activity)
  if (user_email) await activateReferral(user_email);

  res.json(data[0]);
});

app.get('/api/product-requests', async (req, res) => {
  const { data, error } = await supabase.from('product_requests').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/product-requests/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  if (!comment || comment.trim() === '') return res.status(400).json({ error: 'Comment required' });
  const { data, error } = await supabase.from('product_requests').update({
    status: 'approved', admin_comment: comment, reviewed_at: new Date().toISOString(), reviewed_by: ADMIN_EMAIL
  }).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.post('/api/product-requests/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  if (!comment || comment.trim() === '') return res.status(400).json({ error: 'Comment required' });
  const { data, error } = await supabase.from('product_requests').update({
    status: 'rejected', admin_comment: comment, reviewed_at: new Date().toISOString(), reviewed_by: ADMIN_EMAIL
  }).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

/* ============ DEPOSITS ============ */
app.post('/api/deposits', async (req, res) => {
  const { email, amount, transactionId, description, request_type, receipt_url, receipt_file_name } = req.body;

  if (!email || !amount) return res.status(400).json({ error: 'Email and amount required' });
  if (!transactionId && !receipt_url) {
    return res.status(400).json({ error: 'Provide transaction ID or receipt' });
  }

  try {
    // Check for duplicate transaction ID
    if (transactionId && transactionId !== 'See receipt') {
      const { data: existing } = await supabase.from('deposits')
        .select('id').eq('transaction_id', transactionId).maybeSingle();
      if (existing) {
        return res.status(400).json({ error: '❌ This transaction ID was already submitted. Please use a unique TXN for each payment.' });
      }
    }

    const { data, error } = await supabase.from('deposits').insert([{
      user_email: email, amount,
      transaction_id: transactionId || 'See receipt',
      description,
      request_type: request_type || 'Course Unlock',
      receipt_url: receipt_url || null,
      receipt_file_name: receipt_file_name || null
    }]).select();
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: '❌ Duplicate transaction ID' });
      }
      throw error;
    }
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

  // ✅ Activate referral when deposit is approved
  const userEmail = data[0]?.user_email;
  if (userEmail) await activateReferral(userEmail);

  res.json(data[0]);
});

app.post('/api/deposits/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  if (!comment || comment.trim() === '') return res.status(400).json({ error: 'Comment required' });
  const { data, error } = await supabase.from('deposits').update({
    status: 'rejected', admin_comment: comment, reviewed_at: new Date().toISOString(), reviewed_by: ADMIN_EMAIL
  }).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

/* ============ ORDERS ============ */
app.post('/api/orders', async (req, res) => {
  const { email, name, description } = req.body;
  const { data, error } = await supabase.from('orders')
    .insert([{ user_email: email, name, description }]).select();
  if (error) return res.status(500).json({ error: error.message });

  // ✅ Activate referral when order is submitted
  if (email) await activateReferral(email);

  res.json(data[0]);
});

app.get('/api/orders', async (req, res) => {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/orders/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  if (!comment || comment.trim() === '') return res.status(400).json({ error: 'Comment required' });
  const { data, error } = await supabase.from('orders').update({
    status: 'approved', admin_comment: comment, reviewed_at: new Date().toISOString(), reviewed_by: ADMIN_EMAIL
  }).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.post('/api/orders/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  if (!comment || comment.trim() === '') return res.status(400).json({ error: 'Comment required' });
  const { data, error } = await supabase.from('orders').update({
    status: 'rejected', admin_comment: comment, reviewed_at: new Date().toISOString(), reviewed_by: ADMIN_EMAIL
  }).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

/* ============ SETTINGS ============ */
app.get('/api/settings/:key', async (req, res) => {
  const { data } = await supabase.from('settings').select('setting_value').eq('setting_key', req.params.key).maybeSingle();
  res.json({ value: data?.setting_value || null });
});

app.get('/api/settings', async (req, res) => {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) return res.status(500).json({ error: error.message });
  const settings = {};
  data.forEach(s => { settings[s.setting_key] = s.setting_value; });
  res.json(settings);
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  const { data: existing } = await supabase.from('settings').select('id').eq('setting_key', key).maybeSingle();
  if (existing) {
    await supabase.from('settings').update({ setting_value: value, updated_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await supabase.from('settings').insert([{ setting_key: key, setting_value: value }]);
  }
  res.json({ message: 'Saved' });
});

/* ============ REFERRALS ============ */
app.post('/api/referrals', async (req, res) => {
  const { referrer_email, referred_email } = req.body;
  if (!referrer_email || !referred_email) return res.status(400).json({ error: 'Missing emails' });
  if (referrer_email === referred_email) return res.status(400).json({ error: 'Cannot refer yourself' });

  const { data: existing } = await supabase.from('referrals').select('id').eq('referred_email', referred_email).maybeSingle();
  if (existing) return res.json({ message: 'Already referred', alreadyReferred: true });

  await supabase.from('referrals').insert([{
    referrer_email, referred_email, status: 'pending'
  }]);

  res.json({ message: 'Referral recorded — friend needs to activate to count!' });
});

app.get('/api/referrals/:email', async (req, res) => {
  const { data, error } = await supabase.from('referrals')
    .select('*').eq('referrer_email', req.params.email).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const { data: credits } = await supabase.from('free_credits')
    .select('credits').eq('user_email', req.params.email).maybeSingle();

  const activeCount = (data || []).filter(r => r.status === 'active').length;
  const pendingCount = (data || []).filter(r => r.status === 'pending').length;

  res.json({
    referrals: data || [],
    count: activeCount,
    activeCount,
    pendingCount,
    credits: credits?.credits || 0
  });
});

app.post('/api/free-credits/use', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const { data: credit } = await supabase.from('free_credits').select('*').eq('user_email', email).maybeSingle();
  if (!credit || credit.credits < 1) return res.status(400).json({ error: 'No credits available' });
  await supabase.from('free_credits').update({ credits: credit.credits - 1, updated_at: new Date().toISOString() }).eq('id', credit.id);
  res.json({ message: 'Credit used', remaining: credit.credits - 1 });
});

app.get('/api/free-credits/:email', async (req, res) => {
  const { data } = await supabase.from('free_credits').select('credits').eq('user_email', req.params.email).maybeSingle();
  res.json({ credits: data?.credits || 0 });
});

/* ============ USERS ============ */
app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('id, email, password, role, status, referral_code');
  if (error) return res.status(500).json({ error: error.message });
  const safeData = data.map(u => {
    if (u.role === 'admin') return { ...u, password: '🔒 Hidden' };
    return u;
  });
  res.json(safeData);
});

app.post('/api/users/:id/reset-password', async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password 6+ chars' });
  const { data: target } = await supabase.from('users').select('role').eq('id', req.params.id).single();
  if (target?.role === 'admin') return res.status(403).json({ error: '❌ Cannot reset admin password here. Use Settings → Secret code.' });
  const { data, error } = await supabase.from('users').update({ password: newPassword }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Updated', user: data });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
}
module.exports = app;