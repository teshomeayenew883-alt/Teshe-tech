/* TESHE TECH - app.js */
let currentUser = null;
let courses = [];
let products = [];
let userAccess = {};
let isLoginMode = true;

// Auto-detect API URL — works locally AND on Render
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : window.location.origin + '/api';

const CATEGORIES = {
  'fullstack': { label: '💻 Full-Stack Development', subs: ['HTML','CSS','JavaScript','TypeScript','React','Vue','Angular','Node.js','Express','MongoDB','PostgreSQL','REST API','GraphQL'] },
  'machine-learning': { label: '🤖 Machine Learning', subs: ['Python','TensorFlow','PyTorch','Scikit-learn','NLP','Computer Vision','Deep Learning'] },
  'data-science': { label: '📊 Data Science', subs: ['Pandas','NumPy','Matplotlib','Statistics','Data Analysis','Data Visualization','Jupyter','R'] },
  'database': { label: '🗄️ Database', subs: ['SQL Basics','MySQL','PostgreSQL','MongoDB','Oracle','Redis','Database Design'] },
  'cyber-security': { label: '🔒 Cyber Security', subs: ['Network Security','Ethical Hacking','Cryptography','Penetration Testing','Security Auditing'] },
  'mobile': { label: '📱 Mobile Development', subs: ['Android (Kotlin)','iOS (Swift)','React Native','Flutter','Mobile UI/UX'] },
  'devops': { label: '⚙️ DevOps', subs: ['Docker','Kubernetes','CI/CD','AWS','Azure','GCP','Linux Admin'] },
  'design': { label: '🎨 UI/UX Design', subs: ['Figma','Adobe XD','Sketch','Wireframing','Prototyping','Design Systems'] }
};
const CATEGORY_ICONS = { 'fullstack':'💻','machine-learning':'🤖','data-science':'📊','database':'🗄️','cyber-security':'🔒','mobile':'📱','devops':'⚙️','design':'🎨' };

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
  enforceAdminLock();
  setupCategoryCascade();
  setupFormatToggle();
  setupVideoSourceToggle();
  setupVideoUpload();
  setupNoteFileUpload();
  setupNoteSourceToggle();
  await loadData();
  checkAuth();
  updateAdminVisibility();
  handleHash();
});

function enforceAdminLock() {
  const nav = document.getElementById('adminNavItem');
  const page = document.getElementById('page-admin');
  if (nav) nav.style.display = 'none';
  if (page) { page.classList.remove('active'); page.style.display = 'none'; }
  document.body.classList.remove('is-admin');
}

function updateAdminVisibility() {
  const nav = document.getElementById('adminNavItem');
  const page = document.getElementById('page-admin');
  if (currentUser && currentUser.role === 'admin') {
    document.body.classList.add('is-admin');
    if (nav) nav.style.display = 'block';
    loadAdminData();
  } else {
    document.body.classList.remove('is-admin');
    if (nav) nav.style.display = 'none';
    if (page) { page.classList.remove('active'); page.style.display = 'none'; }
  }
}

function handleHash() {
  const hash = window.location.hash.replace('#','') || 'home';
  if (hash === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
    history.replaceState(null, '', '#home');
    showToast('⚠️ Admin access only');
    return;
  }
  const allowed = ['home','buy','order','admin','about','contact','category','course-detail'];
  if (!allowed.includes(hash)) return;
  document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${hash}`);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-menu a').forEach(l => {
    l.classList.remove('active');
    if (l.dataset.page === hash) l.classList.add('active');
  });
  if (hash === 'admin') loadAdminData();
}
window.addEventListener('hashchange', handleHash);

async function loadData() {
  try {
    const [cRes, pRes] = await Promise.all([fetch(`${API_URL}/courses`), fetch(`${API_URL}/products`)]);
    courses = await cRes.json();
    products = await pRes.json();
    renderCategories();
    renderProducts();
  } catch (err) { console.error(err); }
}

async function loadUserAccess() {
  if (!currentUser) { userAccess = {}; return; }
  try {
    const res = await fetch(`${API_URL}/user-access/${encodeURIComponent(currentUser.email)}`);
    const data = await res.json();
    userAccess = {};
    data.forEach(row => { if (row.has_access) userAccess[row.course_id] = true; });
  } catch (err) { userAccess = {}; }
}

function checkAuth() {
  const saved = localStorage.getItem('tesheUser');
  if (saved) {
    currentUser = JSON.parse(saved);
    overlay.classList.add('hidden');
    loadUserAccess();
  } else {
    currentUser = null;
    overlay.classList.remove('hidden');
  }
}

overlayAuthBtn.addEventListener('click', async () => {
  const email = overlayEmail.value.trim();
  const password = overlayPassword.value.trim();
  overlayError.textContent = '';
  if (!email || !password) { overlayError.textContent = 'Please fill all fields'; return; }
  const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { overlayError.textContent = data.error || 'Login failed'; return; }
    currentUser = data.user;
    localStorage.setItem('tesheUser', JSON.stringify(currentUser));
    overlay.classList.add('hidden');
    showToast(`✅ Welcome, ${email}!`);
    updateAdminVisibility();
    overlayEmail.value = '';
    overlayPassword.value = '';
    await loadUserAccess();
    await loadData();
  } catch (err) { overlayError.textContent = '❌ Server not running?'; }
});

overlayPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') overlayAuthBtn.click(); });

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
  userAccess = {};
  localStorage.removeItem('tesheUser');
  overlay.classList.remove('hidden');
  enforceAdminLock();
  history.replaceState(null, '', '#home');
  document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  showToast('👋 Logged out');
});

const forgotModal = document.getElementById('forgotModal');
const forgotError = document.getElementById('forgotError');
document.getElementById('forgotPasswordLink')?.addEventListener('click', () => {
  forgotError.textContent = '';
  document.getElementById('forgotEmail').value = overlayEmail.value.trim();
  document.getElementById('forgotReason').value = '';
  forgotModal.classList.add('active');
});
document.getElementById('forgotCancel')?.addEventListener('click', () => forgotModal.classList.remove('active'));
document.getElementById('forgotSubmit')?.addEventListener('click', async () => {
  const email = document.getElementById('forgotEmail').value.trim();
  const reason = document.getElementById('forgotReason').value.trim();
  forgotError.textContent = '';
  if (!email) { forgotError.textContent = 'Enter email'; return; }
  const res = await fetch(`${API_URL}/password-reset/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, reason })
  });
  const data = await res.json();
  if (!res.ok) { forgotError.textContent = data.error; return; }
  showToast('✅ Request sent!');
  forgotModal.classList.remove('active');
});

function userHasAccess(course) {
  if (currentUser && currentUser.role === 'admin') return true;
  if (course.type === 'free' || course.type === 'sample') return true;
  if (!course.locked) return true;
  if (userAccess[course.id]) return true;
  return false;
}

function renderCategories() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;
  const catCounts = {};
  courses.forEach(c => { if (c.category) catCounts[c.category] = (catCounts[c.category]||0)+1; });
  grid.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <div class="category-card" onclick="openCategory('${key}')">
      <div class="category-icon">${CATEGORY_ICONS[key]}</div>
      <div class="category-name">${cat.label}</div>
      <div class="category-count">${catCounts[key] || 0} sub-course${(catCounts[key]||0)!==1?'s':''}</div>
    </div>
  `).join('');
}

function openCategory(catKey) {
  const cat = CATEGORIES[catKey];
  if (!cat) return;
  sessionStorage.setItem('lastCategory', catKey);
  const catCourses = courses.filter(c => c.category === catKey);
  document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
  document.getElementById('page-category').classList.add('active');
  document.getElementById('categoryTitle').textContent = `${CATEGORY_ICONS[catKey]} ${cat.label}`;
  document.getElementById('categoryDesc').textContent = `${catCourses.length} sub-courses available`;
  const grid = document.getElementById('categoryCoursesGrid');
  if (catCourses.length === 0) {
    grid.innerHTML = `<p style="text-align:center; color:#6b7280; padding:2rem;">No courses yet. Admin is working on it!</p>`;
    return;
  }
  const groups = {};
  catCourses.forEach(c => {
    const sub = c.sub_category || c.course_tag || 'General';
    if (!groups[sub]) groups[sub] = [];
    groups[sub].push(c);
  });
  let html = '';
  Object.entries(groups).forEach(([subName, items]) => {
    html += `<h3 class="sub-cat-head">📖 ${subName}</h3><div class="cources">`;
    items.forEach(c => {
      const hasAccess = userHasAccess(c);
      const lockIcon = hasAccess ? (c.type === 'free' ? '🆓' : '📖') : '🔒';
      const label = hasAccess ? 'Open' : 'Locked';
      html += `
        <a onclick="openCourse('${c.name.replace(/'/g, "\\'")}')" class="${hasAccess ? '' : 'locked-course'}">
          <div style="font-size:1.4rem;">${lockIcon}</div>
          <div><b>${c.name}</b></div>
          <div style="font-size:0.75rem; color:#6b7280;">${c.format === 'note' ? '📝 Note' : '🎥 Video'} · ${label}</div>
          <div class="price-tag">${c.price} Birr</div>
        </a>`;
    });
    html += '</div>';
  });
  grid.innerHTML = html;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.openCategory = openCategory;

document.getElementById('backToHome')?.addEventListener('click', () => {
  document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.querySelectorAll('.nav-menu a').forEach(l => l.classList.remove('active'));
  document.querySelector('.nav-menu a[data-page="home"]')?.classList.add('active');
});

function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  if (products.length === 0) {
    grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color:#6b7280;">No products yet.</p>';
    return;
  }
  const imgs = { ecommerce:'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&q=80', shop:'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&q=80', website:'https://images.unsplash.com/photo-1547658719-da2b51169166?w=600&q=80', mobile:'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&q=80', dashboard:'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80', ai:'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&q=80', school:'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&q=80' };
  function getImg(p) {
    if (p.image_url) return p.image_url;
    const text = (p.name + ' ' + (p.description||'') + ' ' + (p.category||'')).toLowerCase();
    for (const k in imgs) if (text.includes(k)) return imgs[k];
    return 'https://images.unsplash.com/photo-1517180102446-f3ece451e9d8?w=600&q=80';
  }
  grid.innerHTML = products.map(p => `
    <div class="product-card">
      <img class="product-image" src="${getImg(p)}" onerror="this.src='https://images.unsplash.com/photo-1517180102446-f3ece451e9d8?w=600&q=80'">
      <div class="product-body">
        <h3>${p.name}</h3>
        <div class="price">${p.price} Birr</div>
        <div class="desc">${p.description||''}</div>
        ${p.product_link ? `<a href="${p.product_link}" target="_blank" class="btn-visit">🌐 Visit Product</a>` : ''}
        <button class="btn-buy" onclick="requestBuyProduct(${p.id}, '${p.name.replace(/'/g,"\\'")}')">🛍️ Request Buy</button>
      </div>
    </div>
  `).join('');
}

async function openCourse(courseName) {
  const course = courses.find(c => c.name === courseName);
  if (!course) return;
  const hasAccess = userHasAccess(course);
  if (!hasAccess) {
    if (!currentUser) return showToast('⚠️ Please login first');
    return showDepositModal('Course Unlock', courseName, course.price);
  }
  document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
  document.getElementById('page-course-detail').classList.add('active');
  document.getElementById('courseDetailTitle').textContent = course.name;
  const grid = document.getElementById('courseVideoGrid');
  let html = '';
  if (course.description) {
    html += `<div style="width:100%; padding:1rem; background:#f9fafb; border-radius:14px; margin-bottom:1rem;"><b>📖 Description:</b><br>${course.description}</div>`;
  }
  if (course.format === 'note') {
    if (course.note_text) {
      html += `<div style="width:100%; padding:1.5rem; background:#fff; border:1px solid #e5e7eb; border-radius:14px; line-height:1.8; white-space:pre-wrap;">${course.note_text}</div>`;
      if (course.type === 'free' || course.type === 'sample') {
        html += `<div style="width:100%; text-align:center; margin-top:1rem;"><button onclick="downloadNote('${course.name.replace(/'/g,"\\'")}')" class="download-btn">⬇️ Download Note</button></div>`;
      } else {
        html += `<div style="width:100%; text-align:center; margin-top:1rem; color:#9ca3af; font-size:0.9rem;">🔒 Download disabled for locked courses</div>`;
      }
    }
    if (course.note_file_url) {
      const fn = course.note_file_name || 'Note file';
      const ext = fn.split('.').pop().toLowerCase();
      const icon = ext === 'pdf' ? '📕' : (ext === 'doc' || ext === 'docx') ? '📘' : (ext === 'txt') ? '📄' : (['jpg','jpeg','png','webp'].includes(ext)) ? '🖼️' : '📎';
      html += `<div style="width:100%; padding:1.2rem; background:#f9fafb; border:2px dashed #c7d2fe; border-radius:14px; text-align:center; margin-top:1rem;">
        <div style="font-size:2.5rem;">${icon}</div>
        <div style="font-weight:700; color:#1a1a2e; margin:0.4rem 0;">${fn}</div>`;
      if (course.type === 'free' || course.type === 'sample') {
        html += `<a href="${course.note_file_url}" download class="download-btn" style="margin-top:0.5rem;">⬇️ Download File</a>`;
      } else {
        html += `<div style="color:#9ca3af; font-size:0.9rem;">🔒 Download disabled for locked courses</div>`;
      }
      html += `</div>`;
    }
  } else if (course.format === 'video' && course.video_url) {
    let embedUrl = course.video_url;
    if (embedUrl.startsWith('http') && (embedUrl.includes('supabase') || embedUrl.includes('/uploads/'))) {
      // Supabase or local video — use <video> tag
      html += `<div class="course-video-item" style="max-width:100%;"><video controls style="width:100%; border-radius:12px; background:#000;"><source src="${embedUrl}" type="video/mp4"></video><h4>${course.name}</h4></div>`;
      if (course.type === 'free' || course.type === 'sample') {
        html += `<div style="width:100%; text-align:center; margin-top:1rem;"><a href="${embedUrl}" download class="download-btn">⬇️ Download Video</a></div>`;
      } else {
        html += `<div style="width:100%; text-align:center; margin-top:1rem; color:#9ca3af; font-size:0.9rem;">🔒 Download disabled</div>`;
      }
    } else {
      // YouTube
      if (embedUrl.includes('watch?v=')) { const id = embedUrl.split('v=')[1]?.split('&')[0]; if (id) embedUrl = 'https://www.youtube.com/embed/' + id; }
      else if (embedUrl.includes('youtu.be/')) { const id = embedUrl.split('youtu.be/')[1]?.split('?')[0]; if (id) embedUrl = 'https://www.youtube.com/embed/' + id; }
      html += `<div class="course-video-item" style="max-width:100%;"><iframe src="${embedUrl}" allowfullscreen></iframe><h4>${course.name}</h4></div>`;
      html += `<div style="width:100%; text-align:center; margin-top:1rem; color:#9ca3af; font-size:0.9rem;">▶️ YouTube videos cannot be downloaded</div>`;
    }
  }
  grid.innerHTML = html || '<p style="color:#6b7280;">No content yet.</p>';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.openCourse = openCourse;

function downloadNote(courseName) {
  const course = courses.find(c => c.name === courseName);
  if (!course || !course.note_text) return;
  if (course.type !== 'free' && course.type !== 'sample') return showToast('🔒 Only free notes downloadable');
  const header = `════════════════════════════════════════
   ${course.name}
   Teshe Tech
════════════════════════════════════════\n\n`;
  const blob = new Blob([header + course.note_text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = course.name.replace(/[^a-z0-9]/gi, '_') + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✅ Downloaded!');
}
window.downloadNote = downloadNote;

document.getElementById('backToCourses')?.addEventListener('click', () => {
  const lastCat = sessionStorage.getItem('lastCategory');
  if (lastCat) openCategory(lastCat);
  else {
    document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
    document.getElementById('page-home').classList.add('active');
  }
});

function showDepositModal(type, name, price) {
  if (!currentUser) return showToast('⚠️ Login first');
  document.getElementById('modalSub').textContent = `Pay ${price} Birr for "${name}"`;
  document.getElementById('depositAmount').value = price;
  document.getElementById('depositModal').classList.add('active');
}
document.getElementById('modalCancel')?.addEventListener('click', () => document.getElementById('depositModal').classList.remove('active'));
document.getElementById('modalConfirm')?.addEventListener('click', async () => {
  const amount = document.getElementById('depositAmount').value;
  const txn = document.getElementById('depositTxn').value;
  if (!txn) return showToast('⚠️ Enter transaction ID');
  const res = await fetch(`${API_URL}/deposits`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: currentUser.email, amount, transactionId: txn, description: document.getElementById('modalSub').textContent })
  });
  if (res.ok) {
    showToast('✅ Payment submitted!');
    document.getElementById('depositModal').classList.remove('active');
  }
});

async function requestBuyProduct(productId, productName) {
  if (!currentUser) return showToast('⚠️ Please login first');
  const message = prompt(`Send request to buy "${productName}"?\n\nAdd a message (optional):`) || '';
  const res = await fetch(`${API_URL}/product-requests`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, product_name: productName, user_email: currentUser.email, user_name: currentUser.email.split('@')[0], message })
  });
  if (res.ok) showToast('✅ Request sent!');
}
window.requestBuyProduct = requestBuyProduct;

document.getElementById('submitOrder')?.addEventListener('click', async () => {
  if (!currentUser) return showToast('⚠️ Login first');
  const name = document.getElementById('orderName').value;
  const description = document.getElementById('orderProduct').value;
  if (!description) return showToast('⚠️ Describe your software');
  const res = await fetch(`${API_URL}/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: currentUser.email, name, description })
  });
  if (res.ok) {
    showToast('✅ Order submitted!');
    document.getElementById('orderName').value = '';
    document.getElementById('orderProduct').value = '';
  }
});

function setupCategoryCascade() {
  const catSel = document.getElementById('newCourseCategory');
  const subSel = document.getElementById('newCourseSubCategory');
  if (!catSel || !subSel) return;
  catSel.addEventListener('change', () => {
    const cat = catSel.value;
    subSel.innerHTML = '<option value="">-- Choose sub-category --</option>';
    if (cat && CATEGORIES[cat]) {
      CATEGORIES[cat].subs.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub; opt.textContent = sub;
        subSel.appendChild(opt);
      });
    }
  });
}

function setupFormatToggle() {
  document.querySelectorAll('.format-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.format-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const f = opt.dataset.format;
      document.getElementById('videoInputs').style.display = f === 'video' ? 'block' : 'none';
      document.getElementById('noteInputs').style.display = f === 'note' ? 'block' : 'none';
    });
  });
}

function setupVideoSourceToggle() {
  document.querySelectorAll('.source-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.source-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const s = opt.dataset.source;
      document.getElementById('youtubeInputBox').style.display = s === 'youtube' ? 'block' : 'none';
      document.getElementById('fileInputBox').style.display = s === 'file' ? 'block' : 'none';
    });
  });
}

function setupNoteSourceToggle() {
  document.querySelectorAll('.note-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.note-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const s = opt.dataset.notesource;
      document.getElementById('noteTextBox').style.display = s === 'text' ? 'block' : 'none';
      document.getElementById('noteFileBox').style.display = s === 'file' ? 'block' : 'none';
    });
  });
}

function setupVideoUpload() {
  const dz = document.getElementById('videoDropZone');
  const fi = document.getElementById('newCourseVideoFile');
  const label = document.getElementById('selectedFileName');
  if (!dz || !fi) return;
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor='#667eea'; });
  dz.addEventListener('dragleave', () => { dz.style.borderColor='#c7d2fe'; });
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.style.borderColor='#c7d2fe';
    if (e.dataTransfer.files.length > 0) { fi.files = e.dataTransfer.files; showFileName(e.dataTransfer.files[0], label); }
  });
  fi.addEventListener('change', () => { if (fi.files.length > 0) showFileName(fi.files[0], label); });
}

function setupNoteFileUpload() {
  const dz = document.getElementById('noteDropZone');
  const fi = document.getElementById('newCourseNoteFile');
  const label = document.getElementById('selectedNoteFileName');
  if (!dz || !fi) return;
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor='#667eea'; });
  dz.addEventListener('dragleave', () => { dz.style.borderColor='#c7d2fe'; });
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.style.borderColor='#c7d2fe';
    if (e.dataTransfer.files.length > 0) { fi.files = e.dataTransfer.files; showFileName(e.dataTransfer.files[0], label); }
  });
  fi.addEventListener('change', () => { if (fi.files.length > 0) showFileName(fi.files[0], label); });
}

function showFileName(file, label) {
  if (!label) return;
  const size = (file.size/1024/1024).toFixed(2);
  label.textContent = `✅ ${file.name} (${size} MB)`;
}

document.getElementById('addCourseBtn')?.addEventListener('click', async () => {
  if (!currentUser || currentUser.role !== 'admin') return;
  const category = document.getElementById('newCourseCategory').value;
  const subCategory = document.getElementById('newCourseSubCategory').value;
  const name = document.getElementById('newCourseName').value.trim();
  const description = document.getElementById('newCourseDesc').value.trim();
  const price = document.getElementById('newCoursePrice').value.trim();
  const type = document.getElementById('newCourseType').value;
  const format = document.querySelector('.format-option.active')?.dataset.format || 'video';
  const videoSource = document.querySelector('.source-option.active')?.dataset.source || 'youtube';
  const noteSource = document.querySelector('.note-option.active')?.dataset.notesource || 'text';
  const status = document.getElementById('courseUploadStatus');

  if (!category) return showToast('⚠️ Choose main category');
  if (!subCategory) return showToast('⚠️ Choose sub-category');
  if (!name) return showToast('⚠️ Course name required');

  let video_url = null, note_text = null, note_file_url = null, note_file_name = null;

  if (format === 'video') {
    if (videoSource === 'youtube') {
      video_url = document.getElementById('newCourseVideoUrl').value.trim();
      if (!video_url) return showToast('⚠️ Add YouTube URL');
    } else {
      const fi = document.getElementById('newCourseVideoFile');
      if (!fi.files || fi.files.length === 0) return showToast('⚠️ Choose a video file');
      status.textContent = '📤 Uploading video...'; status.style.color = '#667eea';
      const fd = new FormData(); fd.append('video', fi.files[0]);
      try {
        const up = await fetch(`${API_URL}/upload-video`, { method: 'POST', body: fd });
        const ud = await up.json();
        if (!up.ok) throw new Error(ud.error);
        video_url = ud.url;
        status.textContent = '✅ Video uploaded!'; status.style.color = '#22c55e';
      } catch (err) { status.textContent = '❌ ' + err.message; status.style.color = '#ef4444'; return; }
    }
  } else {
    if (noteSource === 'text') {
      note_text = document.getElementById('newCourseNote').value.trim();
      if (!note_text) return showToast('⚠️ Add note content');
    } else {
      const fi = document.getElementById('newCourseNoteFile');
      if (!fi.files || fi.files.length === 0) return showToast('⚠️ Choose a note file');
      status.textContent = '📤 Uploading file...'; status.style.color = '#667eea';
      const fd = new FormData(); fd.append('notefile', fi.files[0]);
      try {
        const up = await fetch(`${API_URL}/upload-note`, { method: 'POST', body: fd });
        const ud = await up.json();
        if (!up.ok) throw new Error(ud.error);
        note_file_url = ud.url;
        note_file_name = ud.originalName;
        status.textContent = '✅ File uploaded!'; status.style.color = '#22c55e';
      } catch (err) { status.textContent = '❌ ' + err.message; status.style.color = '#ef4444'; return; }
    }
  }

  try {
    const res = await fetch(`${API_URL}/courses`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price, type, format, note_text, video_url, note_file_url, note_file_name, description, course_tag: subCategory, category, sub_category: subCategory })
    });
    if (res.ok) {
      showToast('✅ Course added!');
      document.getElementById('newCourseName').value = '';
      document.getElementById('newCourseDesc').value = '';
      document.getElementById('newCoursePrice').value = '';
      document.getElementById('newCourseVideoUrl').value = '';
      const nt = document.getElementById('newCourseNote'); if (nt) nt.value = '';
      document.getElementById('newCourseCategory').value = '';
      document.getElementById('newCourseSubCategory').innerHTML = '<option value="">-- Choose main category first --</option>';
      const vf = document.getElementById('newCourseVideoFile'); if (vf) vf.value = '';
      const nf = document.getElementById('newCourseNoteFile'); if (nf) nf.value = '';
      const sf = document.getElementById('selectedFileName'); if (sf) sf.textContent = '';
      const nsf = document.getElementById('selectedNoteFileName'); if (nsf) nsf.textContent = '';
      if (status) status.textContent = '';
      loadAdminData(); loadData();
    } else {
      const d = await res.json();
      showToast('❌ ' + (d.error || 'Failed'));
    }
  } catch (err) { showToast('❌ ' + err.message); }
});

document.getElementById('addProductBtn')?.addEventListener('click', async () => {
  if (!currentUser || currentUser.role !== 'admin') return;
  const name = document.getElementById('newProductName').value.trim();
  const price = document.getElementById('newProductPrice').value.trim();
  const description = document.getElementById('newProductDesc').value.trim();
  const product_link = document.getElementById('newProductLink').value.trim();
  const image_url = document.getElementById('newProductImage').value.trim();
  const category = document.getElementById('newProductCategory').value.trim();
  if (!name) return showToast('⚠️ Product name required');
  const res = await fetch(`${API_URL}/products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, description, product_link, image_url, category })
  });
  if (res.ok) {
    showToast('✅ Product added!');
    document.getElementById('newProductName').value = '';
    document.getElementById('newProductPrice').value = '';
    document.getElementById('newProductDesc').value = '';
    document.getElementById('newProductLink').value = '';
    document.getElementById('newProductImage').value = '';
    document.getElementById('newProductCategory').value = '';
    loadAdminData(); loadData();
  }
});

async function loadAdminData() {
  if (!currentUser || currentUser.role !== 'admin') return;
  try {
    const [dR,oR,cR,pR,uR,rR,prR] = await Promise.all([
      fetch(`${API_URL}/deposits`), fetch(`${API_URL}/orders`), fetch(`${API_URL}/courses`),
      fetch(`${API_URL}/products`), fetch(`${API_URL}/users`), fetch(`${API_URL}/password-reset`),
      fetch(`${API_URL}/product-requests`)
    ]);
    const [dD,oD,cD,pD,uD,rD,prD] = await Promise.all([dR.json(),oR.json(),cR.json(),pR.json(),uR.json(),rR.json(),prR.json()]);

    const dl = document.getElementById('depositList');
    if (dl) {
      dl.innerHTML = dD.length === 0 ? '<p style="color:#6b7280;">No deposits yet.</p>' :
        dD.map(d => {
          const badge = d.status==='approved' ? '<span style="background:#22c55e;color:#fff;padding:0.15rem 0.6rem;border-radius:12px;font-size:0.75rem;">✅ Approved</span>' :
            d.status==='rejected' ? '<span style="background:#ef4444;color:#fff;padding:0.15rem 0.6rem;border-radius:12px;font-size:0.75rem;">❌ Rejected</span>' :
            '<span style="background:#f59e0b;color:#fff;padding:0.15rem 0.6rem;border-radius:12px;font-size:0.75rem;">⏳ Pending</span>';
          return `<div style="background:#f9fafb;padding:1rem;border-radius:14px;margin-bottom:0.8rem;border-left:4px solid #f59e0b;">
            <div><b style="color:#764ba2;">${d.user_email}</b> ${badge}</div>
            <div style="margin-top:0.4rem;">Amount: <b>${d.amount} Birr</b> · TXN: <b>${d.transaction_id}</b></div>
            <div style="color:#6b7280;font-size:0.9rem;margin-top:0.3rem;">${d.description||''}</div>
            ${d.admin_comment ? `<div style="margin-top:0.4rem;padding:0.5rem;background:#fff;border-radius:8px;border-left:3px solid #667eea;"><b>Comment:</b> ${d.admin_comment}</div>` : ''}
            ${d.status==='pending' ? `<div style="margin-top:0.6rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
              <input type="text" id="depositComment-${d.id}" placeholder="Comment (required)" style="flex:1;min-width:200px;padding:0.5rem;border-radius:10px;border:2px solid #e5e7eb;">
              <button onclick="approveDeposit(${d.id})" style="padding:0.5rem 1rem;border-radius:20px;border:none;background:#22c55e;color:#fff;font-weight:700;">✅ Approve</button>
              <button onclick="rejectDeposit(${d.id})" style="padding:0.5rem 1rem;border-radius:20px;border:none;background:#ef4444;color:#fff;font-weight:700;">❌ Reject</button>
            </div>` : ''}
          </div>`;
        }).join('');
    }

    const ol = document.getElementById('orderList');
    if (ol) {
      ol.innerHTML = oD.length === 0 ? '<p style="color:#6b7280;">No orders yet.</p>' :
        oD.map(o => `<div style="background:#f9fafb;padding:1rem;border-radius:14px;margin-bottom:0.6rem;border-left:4px solid #06b6d4;">
          <b style="color:#764ba2;">${o.name||'Unknown'}</b> (${o.user_email})
          <div style="margin-top:0.4rem;color:#374151;">${o.description}</div>
        </div>`).join('');
    }

    const prl = document.getElementById('productReqList');
    if (prl) {
      prl.innerHTML = prD.length === 0 ? '<p style="color:#6b7280;">No product requests yet.</p>' :
        prD.map(r => `<div style="background:#f9fafb;padding:1rem;border-radius:14px;margin-bottom:0.6rem;border-left:4px solid #ec4899;">
          <b style="color:#764ba2;">${r.user_email}</b> wants <b>${r.product_name}</b>
          ${r.message ? `<div style="margin-top:0.4rem;color:#374151;">"${r.message}"</div>` : ''}
        </div>`).join('');
    }

    const cal = document.getElementById('courseAdminList');
    if (cal) {
      cal.innerHTML = cD.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:#6b7280;">No courses yet.</td></tr>' :
        cD.map(c => {
          const catLabel = CATEGORIES[c.category]?.label || c.category || '-';
          return `<tr>
            <td>${c.name}</td><td style="font-size:0.8rem;">${catLabel}</td>
            <td style="font-size:0.8rem;">${c.sub_category||c.course_tag||'-'}</td>
            <td>${c.format==='note'?'📝 Note':'🎥 Video'}</td>
            <td>${c.price} Birr</td><td>${c.type}</td><td>${c.locked?'🔒':'🔓'}</td>
            <td>
              <button onclick="editCoursePrice(${c.id})" style="background:#667eea;color:#fff;padding:0.35rem 0.7rem;border:none;border-radius:16px;font-size:0.75rem;font-weight:700;margin:0.1rem;">💰 Price</button>
              <button onclick="toggleLockAll(${c.id}, ${!c.locked})" style="background:#f59e0b;color:#fff;padding:0.35rem 0.7rem;border:none;border-radius:16px;font-size:0.75rem;font-weight:700;margin:0.1rem;">${c.locked?'🔓 Unlock All':'🔒 Lock All'}</button>
              <button onclick="lockForUser(${c.id}, true)" style="background:#10b981;color:#fff;padding:0.35rem 0.7rem;border:none;border-radius:16px;font-size:0.75rem;font-weight:700;margin:0.1rem;">👤 Grant</button>
              <button onclick="lockForUser(${c.id}, false)" style="background:#ef4444;color:#fff;padding:0.35rem 0.7rem;border:none;border-radius:16px;font-size:0.75rem;font-weight:700;margin:0.1rem;">👤 Revoke</button>
              <button onclick="deleteCourse(${c.id})" style="background:#ef4444;color:#fff;padding:0.35rem 0.7rem;border:none;border-radius:16px;font-size:0.75rem;font-weight:700;margin:0.1rem;">🗑️</button>
            </td>
          </tr>`;
        }).join('');
    }

    const pal = document.getElementById('productAdminList');
    if (pal) {
      pal.innerHTML = pD.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#6b7280;">No products yet.</td></tr>' :
        pD.map(p => `<tr>
          <td>${p.name}</td><td>${p.price} Birr</td>
          <td>${p.product_link ? `<a href="${p.product_link}" target="_blank" style="color:#667eea;">🌐 Link</a>` : '-'}</td>
          <td><button onclick="deleteProduct(${p.id})" style="background:#ef4444;color:#fff;padding:0.35rem 0.7rem;border:none;border-radius:16px;font-size:0.75rem;font-weight:700;">🗑️</button></td>
        </tr>`).join('');
    }

    const ual = document.getElementById('userAdminList');
    if (ual) {
      ual.innerHTML = uD.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#6b7280;">No users yet.</td></tr>' :
        uD.map(u => `<tr>
          <td>${u.email}</td>
          <td><code style="background:#f3f4f6;padding:0.2rem 0.5rem;border-radius:6px;">${u.password}</code></td>
          <td>${u.role==='admin'?'👑 Admin':'👤 User'}</td>
          <td>${u.status==='banned'?'🚫 Banned':'✅ Active'}</td>
          <td><button onclick="adminResetUserPassword(${u.id}, '${u.email}')" style="background:#667eea;color:#fff;padding:0.35rem 0.7rem;border:none;border-radius:16px;font-size:0.75rem;font-weight:700;">🔄 Reset</button></td>
        </tr>`).join('');
    }

    const rl = document.getElementById('resetList');
    if (rl) {
      rl.innerHTML = rD.length === 0 ? '<p style="color:#6b7280;">No reset requests yet.</p>' :
        rD.map(r => {
          const badge = r.status==='resolved' ? '<span style="background:#22c55e;color:#fff;padding:0.15rem 0.6rem;border-radius:12px;font-size:0.75rem;">✅</span>' :
            '<span style="background:#f59e0b;color:#fff;padding:0.15rem 0.6rem;border-radius:12px;font-size:0.75rem;">⏳</span>';
          return `<div style="background:#f9fafb;padding:1rem;border-radius:14px;margin-bottom:0.6rem;border-left:4px solid #8b5cf6;">
            <b style="color:#764ba2;">${r.user_email}</b> ${badge}
            <div style="font-size:0.9rem;color:#6b7280;margin-top:0.3rem;">${r.reason||''}</div>
            ${r.status==='pending' ? `<div style="margin-top:0.6rem;">
              <button onclick="resolveReset(${r.id}, '${r.user_email}')" style="background:#10b981;color:#fff;padding:0.5rem 1rem;border:none;border-radius:20px;font-weight:700;">🔑 Reset</button>
              <button onclick="dismissReset(${r.id})" style="background:#ef4444;color:#fff;padding:0.5rem 1rem;border:none;border-radius:20px;font-weight:700;">❌ Dismiss</button>
            </div>` : ''}
          </div>`;
        }).join('');
    }
  } catch (err) { console.error(err); }
}

async function approveDeposit(id) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const c = document.getElementById(`depositComment-${id}`)?.value.trim();
  if (!c) return showToast('⚠️ Comment required');
  const res = await fetch(`${API_URL}/deposits/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: c }) });
  if (res.ok) { showToast('✅ Approved'); loadAdminData(); }
}
window.approveDeposit = approveDeposit;

async function rejectDeposit(id) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const c = document.getElementById(`depositComment-${id}`)?.value.trim();
  if (!c) return showToast('⚠️ Comment required');
  const res = await fetch(`${API_URL}/deposits/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: c }) });
  if (res.ok) { showToast('❌ Rejected'); loadAdminData(); }
}
window.rejectDeposit = rejectDeposit;

async function editCoursePrice(id) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const c = courses.find(x => x.id === id);
  const np = prompt(`Current: ${c.price} Birr. New:`, c.price);
  if (np === null || np.trim() === '') return;
  const res = await fetch(`${API_URL}/courses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price: np }) });
  if (res.ok) { showToast('✅ Updated'); loadAdminData(); loadData(); }
}
window.editCoursePrice = editCoursePrice;

async function toggleLockAll(id, locked) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const res = await fetch(`${API_URL}/courses/${id}/lock-all`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locked }) });
  if (res.ok) { showToast(locked ? '🔒 Locked for all' : '🔓 Unlocked for all'); loadAdminData(); loadData(); if (currentUser) loadUserAccess(); }
}
window.toggleLockAll = toggleLockAll;

async function lockForUser(id, hasAccess) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const email = prompt(`User email to ${hasAccess ? 'GRANT' : 'REVOKE'}:`);
  if (!email) return;
  const res = await fetch(`${API_URL}/courses/${id}/user-access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userEmail: email, hasAccess }) });
  if (res.ok) showToast(hasAccess ? '✅ Granted' : '🚫 Revoked');
}
window.lockForUser = lockForUser;

async function deleteCourse(id) {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (!confirm('Delete?')) return;
  const res = await fetch(`${API_URL}/courses/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('🗑️'); loadAdminData(); loadData(); }
}
window.deleteCourse = deleteCourse;

async function deleteProduct(id) {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (!confirm('Delete?')) return;
  const res = await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('🗑️'); loadAdminData(); loadData(); }
}
window.deleteProduct = deleteProduct;

async function adminResetUserPassword(id, email) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const np = prompt(`New password for ${email}:`, 'newpass123');
  if (!np || np.length < 6) return;
  const res = await fetch(`${API_URL}/users/${id}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: np }) });
  if (res.ok) { showToast(`✅ ${email} → ${np}`); loadAdminData(); }
}
window.adminResetUserPassword = adminResetUserPassword;

async function resolveReset(id, email) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const np = 'reset' + Math.random().toString(36).substring(2, 8);
  if (!confirm(`New password for ${email}: ${np}`)) return;
  const res = await fetch(`${API_URL}/password-reset/${id}/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: np }) });
  if (res.ok) { alert(`✅ Reset!\n\nEmail: ${email}\nNew: ${np}`); loadAdminData(); }
}
window.resolveReset = resolveReset;

async function dismissReset(id) {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (!confirm('Dismiss?')) return;
  const res = await fetch(`${API_URL}/password-reset/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('🗑️'); loadAdminData(); }
}
window.dismissReset = dismissReset;

document.getElementById('adminResetSelfBtn')?.addEventListener('click', async () => {
  if (!currentUser || currentUser.role !== 'admin') return;
  const np = document.getElementById('adminNewPassword').value.trim();
  const code = document.getElementById('adminHiddenCode').value.trim();
  const s = document.getElementById('adminResetStatus');
  if (!np || np.length < 6) { s.textContent = '❌ 6+ chars'; s.style.color = '#ef4444'; return; }
  if (!code) { s.textContent = '❌ Enter code'; s.style.color = '#ef4444'; return; }
  const res = await fetch(`${API_URL}/auth/admin-reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: currentUser.email, newPassword: np, code }) });
  const d = await res.json();
  if (res.ok) { s.textContent = '✅ Reset! Notification logged.'; s.style.color = '#22c55e'; document.getElementById('adminNewPassword').value = ''; document.getElementById('adminHiddenCode').value = ''; }
  else { s.textContent = '❌ ' + d.error; s.style.color = '#ef4444'; }
});

document.querySelectorAll('.admin-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentUser || currentUser.role !== 'admin') return;
    document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const t = document.getElementById('tab-' + btn.dataset.tab);
    if (t) t.classList.add('active');
    loadAdminData();
  });
});

document.querySelectorAll('.nav-menu a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    if (page === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
      showToast('⚠️ Admin only'); history.replaceState(null, '', '#home'); return;
    }
    document.querySelectorAll('.product-page, .course-detail').forEach(p => p.classList.remove('active'));
    const t = document.getElementById(`page-${page}`);
    if (t) t.classList.add('active');
    document.querySelectorAll('.nav-menu a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.getElementById('navMenu').classList.remove('open');
    history.replaceState(null, '', '#' + page);
    if (page === 'admin') loadAdminData();
  });
});

document.getElementById('navToggle')?.addEventListener('click', () => document.getElementById('navMenu').classList.toggle('open'));
document.getElementById('startlearn')?.addEventListener('click', () => document.getElementById('categoryGrid')?.scrollIntoView({ behavior: 'smooth' }));
document.getElementById('buyproduct')?.addEventListener('click', () => document.querySelectorAll('.nav-menu a').forEach(l => { if (l.dataset.page === 'buy') l.click(); }));
document.getElementById('orderproducts')?.addEventListener('click', () => document.querySelectorAll('.nav-menu a').forEach(l => { if (l.dataset.page === 'order') l.click(); }));

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}