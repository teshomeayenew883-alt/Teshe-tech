let currentUser = null;
let courses = [];
let products = [];
let isLoginMode = true;
const API_URL = 'http://localhost:5000/api';

const overlay = document.getElementById('authOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayAuthBtn = document.getElementById('overlayAuthBtn');
const overlayToggleLink = document.getElementById('overlayToggleLink');
const overlayToggleText = document.getElementById('overlayToggleText');
const overlayEmail = document.getElementById('overlayEmail');
const overlayPassword = document.getElementById('overlayPassword');
const overlayError = document.getElementById('overlayError');
const toast = document.getElementById('toast');

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  checkAuth();
});

async function loadData() {
  try {
    const [cRes, pRes] = await Promise.all([
      fetch(`${API_URL}/courses`),
      fetch(`${API_URL}/products`)
    ]);
    courses = await cRes.json();
    products = await pRes.json();
    renderCourses();
    renderProducts();
  } catch (err) {
    console.error(err);
    showToast('⚠️ Backend connection failed');
  }
}

function checkAuth() {
  const saved = localStorage.getItem('tesheUser');
  if (saved) {
    currentUser = JSON.parse(saved);
    overlay.classList.add('hidden');
    updateAdminVisibility();
  } else {
    overlay.classList.remove('hidden');
  }
}

overlayAuthBtn.addEventListener('click', async () => {
  const email = overlayEmail.value.trim();
  const password = overlayPassword.value.trim();
  if (!email || !password) return showError('Fill all fields');

  const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentUser = data.user;
    localStorage.setItem('tesheUser', JSON.stringify(currentUser));
    overlay.classList.add('hidden');
    showToast(`✅ Welcome, ${email}!`);
    updateAdminVisibility();
    overlayEmail.value = '';
    overlayPassword.value = '';
    await loadData();
  } catch (err) {
    showError(err.message);
  }
});

function showError(msg) {
  overlayError.textContent = msg;
}

overlayToggleLink.addEventListener('click', (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  overlayTitle.textContent = isLoginMode ? '🔐 Welcome Back' : '📝 Create Account';
  overlayAuthBtn.textContent = isLoginMode ? 'Login' : 'Register';
  overlayToggleLink.textContent = isLoginMode ? 'Register' : 'Login';
  overlayToggleText.textContent = isLoginMode ? 'No account?' : 'Have an account?';
  overlayError.textContent = '';
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  currentUser = null;
  localStorage.removeItem('tesheUser');
  overlay.classList.remove('hidden');
  showToast('👋 Logged out');
});

function renderCourses() {
  const grid = document.getElementById('courseGrid');
  if (!grid) return;
  grid.innerHTML = courses.map(c => `
    <a onclick="openCourse('${c.name.replace(/'/g, "\\'")}')">
      <div style="font-size:1.4rem;">${c.type === 'free' ? '🆓' : c.type === 'sample' ? '📖' : '🔒'}</div>
      <div>${c.name}</div>
      <div class="price-tag">${c.price} Birr</div>
    </a>
  `).join('');
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML = products.map(p => `
    <div class="product-card">
      <div style="font-size:2rem;">📦</div>
      <h3>${p.name}</h3>
      <div class="price">${p.price} Birr</div>
      <div style="color:rgba(255,255,255,0.6);font-size:0.9rem;">${p.description || ''}</div>
      <button class="btn-buy" onclick="buyProduct('${p.name.replace(/'/g, "\\'")}', ${p.price})">Buy Now</button>
    </div>
  `).join('');
}

async function openCourse(courseName) {
  const course = courses.find(c => c.name === courseName);
  if (!course) return;
  if (course.type === 'locked' && course.locked) {
    if (!currentUser) return showToast('⚠️ Login first');
    return showDepositModal('Course Unlock', courseName, course.price);
  }
  document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
  document.getElementById('page-course-detail').classList.add('active');
  document.getElementById('courseDetailTitle').textContent = course.name;
  try {
    const res = await fetch(`${API_URL}/videos/${encodeURIComponent(courseName)}`);
    const vids = await res.json();
    document.getElementById('courseVideoGrid').innerHTML = vids.length === 0
      ? '<p>No videos yet.</p>'
      : vids.map(v => `<div class="course-video-item"><iframe src="${v.url}" allowfullscreen></iframe><h4>${v.title}</h4></div>`).join('');
  } catch (err) { console.error(err); }
}

document.getElementById('backToCourses').addEventListener('click', () => {
  document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
});

function showDepositModal(type, name, price) {
  if (!currentUser) return showToast('⚠️ Login first');
  document.getElementById('modalSub').textContent = `Pay ${price} Birr for "${name}"`;
  document.getElementById('depositAmount').value = price;
  document.getElementById('depositModal').classList.add('active');
}

document.getElementById('modalCancel').addEventListener('click', () => {
  document.getElementById('depositModal').classList.remove('active');
});

document.getElementById('modalConfirm').addEventListener('click', async () => {
  const amount = document.getElementById('depositAmount').value;
  const txn = document.getElementById('depositTxn').value;
  if (!txn) return showToast('⚠️ Enter transaction ID');
  try {
    const res = await fetch(`${API_URL}/deposits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentUser.email,
        amount,
        transactionId: txn,
        description: document.getElementById('modalSub').textContent
      })
    });
    if (res.ok) {
      showToast('✅ Payment submitted!');
      document.getElementById('depositModal').classList.remove('active');
    }
  } catch (err) { showToast('❌ Failed'); }
});

document.getElementById('submitOrder').addEventListener('click', async () => {
  if (!currentUser) return showToast('⚠️ Login first');
  const name = document.getElementById('orderName').value;
  const description = document.getElementById('orderProduct').value;
  if (!description) return showToast('⚠️ Add description');
  try {
    const res = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, name, description })
    });
    if (res.ok) {
      showToast('✅ Order submitted!');
      document.getElementById('orderName').value = '';
      document.getElementById('orderProduct').value = '';
    }
  } catch (err) { showToast('❌ Failed'); }
});

function updateAdminVisibility() {
  const adminItem = document.getElementById('adminNavItem');
  if (currentUser && currentUser.role === 'admin') {
    adminItem.style.display = 'block';
  } else {
    adminItem.style.display = 'none';
  }
}

async function loadAdminData() {
  if (!currentUser || currentUser.role !== 'admin') return;
  try {
    const [dRes, oRes] = await Promise.all([
      fetch(`${API_URL}/deposits`),
      fetch(`${API_URL}/orders`)
    ]);
    const dData = await dRes.json();
    const oData = await oRes.json();
    document.getElementById('depositList').innerHTML = dData.map(d => `<div style="background:rgba(139,92,246,0.08);padding:0.8rem;border-radius:12px;margin-bottom:0.5rem;border-left:3px solid #facc15;"><b>${d.user_email}</b> — ${d.amount} Birr<br><small>${d.description}</small><br><small>TXN: ${d.transaction_id}</small></div>`).join('') || '<p>No deposits</p>';
    document.getElementById('orderList').innerHTML = oData.map(o => `<div style="background:rgba(139,92,246,0.08);padding:0.8rem;border-radius:12px;margin-bottom:0.5rem;border-left:3px solid #06b6d4;"><b>${o.name}</b> (${o.user_email})<br>${o.description}</div>`).join('') || '<p>No orders</p>';
  } catch (err) { console.error(err); }
}

document.getElementById('addCourseBtn').addEventListener('click', async () => {
  const name = document.getElementById('newCourseName').value;
  const price = document.getElementById('newCoursePrice').value;
  const type = document.getElementById('newCourseType').value;
  if (!name || !price) return showToast('⚠️ Fill all fields');
  await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, type })
  });
  showToast('✅ Course added');
  loadAdminData();
  loadData();
});

document.getElementById('addProductBtn').addEventListener('click', async () => {
  const name = document.getElementById('newProductName').value;
  const price = document.getElementById('newProductPrice').value;
  const description = document.getElementById('newProductDesc').value;
  if (!name || !price) return showToast('⚠️ Fill all fields');
  await fetch(`${API_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, description })
  });
  showToast('✅ Product added');
  loadAdminData();
  loadData();
});

document.querySelectorAll('.admin-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

document.querySelectorAll('.nav-menu a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    if (page === 'admin' && (!currentUser || currentUser.role !== 'admin')) return;
    document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-menu a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.getElementById('navMenu').classList.remove('open');
    if (page === 'admin') loadAdminData();
  });
});

document.getElementById('navToggle').addEventListener('click', () => {
  document.getElementById('navMenu').classList.toggle('open');
});

document.getElementById('startlearn').addEventListener('click', () => {
  document.getElementById('courseGrid').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('buyproduct').addEventListener('click', () => {
  document.querySelectorAll('.nav-menu a').forEach(l => {
    if (l.dataset.page === 'buy') l.click();
  });
});

document.getElementById('orderproducts').addEventListener('click', () => {
  document.querySelectorAll('.nav-menu a').forEach(l => {
    if (l.dataset.page === 'order') l.click();
  });
});

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

window.openCourse = openCourse;
window.buyProduct = (name, price) => showDepositModal('Product', name, price);