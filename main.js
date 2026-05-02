function showLoginError(message) {
  const el = document.getElementById('loginErrorMessage');
  if (!el) return;
  el.textContent = message ? message : 'Login failed.';
  el.style.display = 'block';
}

function clearLoginError() {
  const el = document.getElementById('loginErrorMessage');
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

// ── 1. SCROLL ANIMATIONS ──────────────────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.12 });
document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));

// ── 2. STICKY NAVBAR ──────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (nav) nav.style.background = window.scrollY > 50
    ? 'rgba(13,13,26,0.98)' : 'rgba(13,13,26,0.88)';
});

// ── 3. MOBILE MENU ────────────────────────────────────────────────────────────
function toggleMenu() {
  const links = document.querySelector('.nav-links');
  if (!links) return;
  const open = links.style.display === 'flex';
  if (open) {
    links.style.display = 'none';
  } else {
    Object.assign(links.style, {
      display: 'flex', flexDirection: 'column', position: 'absolute',
      top: '65px', left: '0', right: '0',
      background: 'rgba(13,13,26,0.98)',
      padding: '20px 24px',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      zIndex: '999'
    });
  }
}

// ── 4. DASHBOARD TABS ─────────────────────────────────────────────────────────
function switchTab(tab, el) {
  const role = getCurrentRole();
  if (tab === 'teacher' && role !== 'teacher') return;
  if (tab === 'student' && role === 'teacher') return;
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dash-content').forEach(c => {
    c.classList.remove('active');
    c.style.display = 'none';
  });
  el.classList.add('active');
  const tabEl = document.getElementById('tab-' + tab);
  if (tabEl) {
    tabEl.classList.add('active');
    tabEl.style.cssText = 'display:grid !important; visibility:visible !important; opacity:1 !important;';
  }

  if (tab === 'teacher' && hasActiveTeacherSession()) {
    refreshRoleData().catch(() => {});
    loadTeacherAttendance().catch(() => {});
    loadTeacherMcqs().catch(() => {});
    loadTeacherDoubts().catch(() => {});
  } else if (tab === 'student' && hasActiveStudentSession()) {
    refreshRoleData().then(() => {
      loadStudentResources();
      loadStudentDoubts();
    });
  }
}

// ── LOGIN MODAL ───────────────────────────────────────────────────────────────
function openLoginModal() {
  document.getElementById('loginModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  updateAuthRequiredState();
}

function openDoubtModal() {
  const modal = document.getElementById('doubtModal');
  const msg = document.getElementById('doubtSubmitMessage');
  if (msg) { msg.textContent = ''; msg.style.display = 'none'; }
  if (modal) modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDoubtModal() {
  const modal = document.getElementById('doubtModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
  const q = document.getElementById('doubtQuestionText');
  const i = document.getElementById('doubtQuestionImage');
  const p = document.getElementById('doubtQuestionImagePreview');
  if (q) q.value = '';
  if (i) i.value = '';
  if (p) { p.style.display = 'none'; p.innerHTML = ''; }
}

async function submitStudentDoubt() {
  const text = (document.getElementById('doubtQuestionText')?.value || '').trim();
  const image = (document.getElementById('doubtQuestionImage')?.value || '').trim();
  const msg = document.getElementById('doubtSubmitMessage');
  if (!text) {
    if (msg) { msg.textContent = 'Please enter your question.'; msg.style.display = 'block'; }
    return;
  }
  try {
    await API.submitStudentDoubt(text, image || null);
    if (msg) { msg.textContent = 'Doubt submitted successfully.'; msg.style.display = 'block'; }
    closeDoubtModal();
    await loadStudentDoubts();
  } catch (err) {
    if (msg) { msg.textContent = err.message || 'Could not submit doubt.'; msg.style.display = 'block'; }
  }
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('open');
  document.body.style.overflow = '';
}

function getStudentDashboardPath(student) {
  const cls = String(student?.class || student?.cls || '').trim();
  const dashboards = { '9': 'class9.html', '10': 'class10.html', '11': 'class11.html', '12': 'class12.html' };
  return dashboards[cls] || 'index.html';
}

function redirectToStudentDashboard(student) {
  const isHome = ['/index.html', '/', ''].includes(window.location.pathname);
  if (isHome) {
    updateHomeForSession();
    refreshRoleData().then(() => {
      loadStudentResources();
      loadStudentDoubts();
    });
    const studentTab = document.getElementById('studentDashTab');
    if (studentTab) switchTab('student', studentTab);
    document.getElementById('dashboards')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  window.location.href = 'index.html#dashboards';
}

function redirectToParentDashboard() {
  const isHome = ['/index.html', '/', ''].includes(window.location.pathname);
  if (isHome) {
    updateHomeForSession();
    refreshRoleData().then(() => {
      loadStudentResources();
      loadStudentDoubts();
    });
    const studentTab = document.getElementById('studentDashTab');
    if (studentTab) switchTab('student', studentTab);
    document.getElementById('dashboards')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  window.location.href = 'index.html#dashboards';
}

function redirectToTeacherDashboard() {
  const isHome = ['/index.html', '/', ''].includes(window.location.pathname);
  if (isHome) {
    updateHomeForSession();
    const teacherTab = document.getElementById('teacherDashTab');
    if (teacherTab) switchTab('teacher', teacherTab);
    document.getElementById('dashboards')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  window.location.href = 'index.html#dashboards';
}

function hasActiveStudentSession() { return !!localStorage.getItem('ilearn_token'); }
function hasActiveParentSession() { return !!localStorage.getItem('ilearn_parent_token'); }
function hasActiveTeacherSession() { return !!localStorage.getItem('ilearn_teacher_token'); }
function redirectAuthenticatedUser() { return hasActiveStudentSession() || hasActiveParentSession() || hasActiveTeacherSession(); }

function toggleProfileMenu() {
  const panel = document.getElementById('profilePanel');
  if (!panel) return;
  panel.classList.toggle('open');
}

function updateAuthRequiredState() {
  const closeBtn = document.querySelector('#loginModal .modal-close');
  if (!closeBtn) return;
  closeBtn.style.display = redirectAuthenticatedUser() ? '' : 'none';
}

async function loginStudentWithPassword() {
  const email = (document.getElementById('ls-email')?.value || '').trim();
  const password = (document.getElementById('ls-password')?.value || '').trim();
  clearLoginError();
  if (!email || !password) {
    showLoginError('Please enter your student email and password.');
    return;
  }
  try {
    const data = await API.loginStudent(email, password);
    closeLoginModal();
    redirectToStudentDashboard(data.student);
  } catch (err) {
    showLoginError(err.message || 'Student login failed');
  }
}

function setLoginType(type) {
  currentLoginType = type;
  const groups = {
    student: document.getElementById('loginStudentFields'),
    teacher: document.getElementById('loginTeacherFields')
  };
  Object.entries(groups).forEach(([key, node]) => {
    if (!node) return;
    node.style.display = key === type ? 'flex' : 'none';
    if (key === type) node.style.flexDirection = 'column';
  });
  ['student', 'teacher'].forEach((key) => {
    document.getElementById('ltab-' + key)?.classList.toggle('active', key === type);
  });
}

function flashInput(id, msg) {
  const el = document.getElementById(id);
  if (el) {
    el.style.borderColor = 'var(--pink)';
    el.focus();
    setTimeout(() => el.style.borderColor = '', 3000);
  }
  alert(msg);
}

// ── PARENT OTP LOGIN ──────────────────────────────────────────────────────────
let currentLoginType = 'student';

async function sendParentOTP() {
  const raw = (document.getElementById('lp-mobile')?.value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) { flashInput('lp-mobile', 'Please enter a valid 10-digit mobile number.'); return; }
  const sendBtn = document.querySelector('#parentStep-mobile .btn-primary');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending OTP...'; }
  try {
    const data = await API.sendParentOTP(raw);
    parentMobile = raw;
    parentOTP = null;
    document.getElementById('parentStep-mobile').style.display = 'none';
    document.getElementById('parentStep-otp').style.display = 'flex';
    document.getElementById('parentStep-otp').style.flexDirection = 'column';
    document.getElementById('parentMobileDisplay').textContent = raw;
    const info = data.studentFound
      ? `OTP sent to ${raw} ✅\nStudent found: ${data.studentName || 'Your child'} (Class ${data.studentClass || '?'})\n\nEnter the OTP received on this number.`
      : `OTP sent to ${raw} ✅\n\nEnter the OTP received on this number.`;
    setTimeout(() => alert(info), 80);
  } catch (err) {
    showOTPError(err.message || 'Failed to send OTP. Please try again.');
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send OTP 📱'; }
  }
}

async function verifyParentOTP() {
  const entered = (document.getElementById('lp-otp')?.value || '').trim();
  const errEl = document.getElementById('parentOTPError');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (!entered) { showOTPError('Please enter the 4-digit OTP.'); return; }
  if (!parentMobile) { showOTPError('Please request an OTP first.'); return; }
  const verifyBtn = document.querySelector('#parentStep-otp .btn-primary');
  if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying...'; }
  try {
    const data = await API.verifyParentOTP(parentMobile, entered);
    closeLoginModal();
    parentOTP = null;
    alert(`OTP verified! ✅\n\n${data.message || 'Redirecting to parent dashboard...'}`);
    redirectToParentDashboard();
  } catch (err) {
    showOTPError(err.message || 'Incorrect OTP. Please try again.');
    const input = document.getElementById('lp-otp');
    if (input) { input.style.borderColor = '#FF2D78'; setTimeout(() => input.style.borderColor = '', 2500); }
  } finally {
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = 'Verify & View Report →'; }
  }
}

function resetParentOTP() {
  parentOTP = null;
  parentMobile = null;
  const mobileStep = document.getElementById('parentStep-mobile');
  const otpStep = document.getElementById('parentStep-otp');
  const errEl = document.getElementById('parentOTPError');
  const mInput = document.getElementById('lp-mobile');
  const oInput = document.getElementById('lp-otp');
  if (mobileStep) { mobileStep.style.display = 'flex'; mobileStep.style.flexDirection = 'column'; }
  if (otpStep) otpStep.style.display = 'none';
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (mInput) mInput.value = '';
  if (oInput) oInput.value = '';
}

async function handleCredentialResponse(response) {
  clearLoginError();
  if (!response?.credential) { showLoginError('Google login failed. Please try again.'); return; }
  try {
    if (currentLoginType === 'teacher') {
      const data = await API.loginTeacherWithGoogle(response.credential);
      closeLoginModal();
      localStorage.setItem('ilearn_teacher', JSON.stringify(data.teacher || {}));
      redirectToTeacherDashboard();
      return;
    }
    const data = await API.loginStudentWithGoogle(response.credential);
    closeLoginModal();
    redirectToStudentDashboard(data.student);
  } catch (err) {
    showLoginError(err.message || 'Google login failed');
  }
}

// ── REGISTER MODAL ────────────────────────────────────────────────────────────
function openRegisterModal() {
  document.getElementById('registerModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  showRegStep(1);
  assessAnswers = {};
  currentQ = 0;
  syncRegisterSubjectVisibility();
}
function closeRegisterModal() {
  document.getElementById('registerModal').classList.remove('open');
  document.body.style.overflow = '';
}
function showRegStep(n) {
  ['regStep1', 'regStep2', 'regStep3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.style.display = (i === n - 1) ? 'flex' : 'none';
    if (el && i === n - 1) el.style.flexDirection = 'column';
  });
}
function syncRegisterSubjectVisibility() {
  const clsEl = document.getElementById('regClass');
  const row = document.getElementById('regSubjectRow');
  const subjectEl = document.getElementById('regSubject');
  if (!clsEl || !row || !subjectEl) return;
  const needsSubject = clsEl.value === '11' || clsEl.value === '12';
  row.style.display = needsSubject ? 'flex' : 'none';
  if (!needsSubject) subjectEl.value = '';
}
const regClassField = document.getElementById('regClass');
if (regClassField) regClassField.addEventListener('change', syncRegisterSubjectVisibility);

// ── CLASS-SPECIFIC QUESTIONS ──────────────────────────────────────────────────
const classQuestions = {
  '9': [
    { q: 'Which of the following is an irrational number?', opts: ['√4', '√9', '√2', '√16'], ans: 2, topic: 'Real Numbers' },
    { q: 'Solve: 2x + 5 = 13. Find x.', opts: ['3', '4', '5', '6'], ans: 1, topic: 'Algebra' },
    { q: 'If A={1,2,3} and B={2,3,4}, then A ∩ B = ?', opts: ['{1}', '{4}', '{2,3}', '{1,2,3,4}'], ans: 2, topic: 'Set Language' },
    { q: 'In a triangle, if two angles are 60° and 70°, the third is:', opts: ['40°', '50°', '60°', '70°'], ans: 1, topic: 'Geometry' },
    { q: 'sin(30°) = ?', opts: ['1', '√3/2', '1/2', '1/√2'], ans: 2, topic: 'Trigonometry' },
    { q: 'Area of circle with radius 7 cm (π=22/7):', opts: ['44 cm²', '154 cm²', '49 cm²', '22 cm²'], ans: 1, topic: 'Mensuration' },
    { q: 'Distance between (0,0) and (3,4) is:', opts: ['5', '7', '12', '25'], ans: 0, topic: 'Coordinate Geometry' },
    { q: 'Mean of 5, 10, 15, 20, 25 is:', opts: ['10', '15', '20', '25'], ans: 1, topic: 'Statistics' },
    { q: 'A bag has 3 red and 2 blue balls. P(red) = ?', opts: ['2/5', '3/5', '1/5', '3/2'], ans: 1, topic: 'Probability' },
    { q: 'Volume of a cube with side 4 cm is:', opts: ['16 cm³', '24 cm³', '48 cm³', '64 cm³'], ans: 3, topic: 'Mensuration' },
  ],
  '10': [
    { q: 'HCF of 12 and 18 is:', opts: ['2', '3', '6', '9'], ans: 2, topic: 'Real Numbers' },
    { q: 'Roots of x² − 5x + 6 = 0 are:', opts: ['2, 3', '1, 6', '−2, −3', '2, −3'], ans: 0, topic: 'Algebra' },
    { q: 'If f(x) = 2x + 1, then f(3) = ?', opts: ['5', '6', '7', '8'], ans: 2, topic: 'Relations and Functions' },
    { q: 'tan(45°) = ?', opts: ['0', '1/√3', '1', '√3'], ans: 2, topic: 'Trigonometry' },
    { q: 'Slope of line joining (1,2) and (3,6) is:', opts: ['1', '2', '3', '4'], ans: 1, topic: 'Coordinate Geometry' },
    { q: 'In a 3-4-5 right triangle, hypotenuse is:', opts: ['3', '4', '5', '6'], ans: 2, topic: 'Geometry' },
    { q: 'Number of tangents from external point to a circle:', opts: ['0', '1', '2', '3'], ans: 2, topic: 'Geometry' },
    { q: 'Volume of sphere radius 3 (π=22/7):', opts: ['28π', '36π', '48π', '54π'], ans: 1, topic: 'Mensuration' },
    { q: 'Standard deviation measures:', opts: ['Average', 'Spread', 'Frequency', 'Range'], ans: 1, topic: 'Statistics' },
    { q: 'P(A)=0.4, P(B)=0.5, P(A∩B)=0.2. P(A∪B)=?', opts: ['0.5', '0.6', '0.7', '0.9'], ans: 2, topic: 'Probability' },
  ],
  '11': [
    { q: 'If A has 5 elements, number of subsets = ?', opts: ['16', '25', '32', '64'], ans: 2, topic: 'Sets' },
    { q: 'Value of i² is:', opts: ['1', '−1', 'i', '−i'], ans: 1, topic: 'Complex Numbers' },
    { q: 'lim(x→0) sin(x)/x = ?', opts: ['0', '∞', '1', '−1'], ans: 2, topic: 'Limits' },
    { q: 'd/dx (x⁴) = ?', opts: ['x³', '4x³', '4x', '3x³'], ans: 1, topic: 'Differentiation' },
    { q: '⁵P₂ = ?', opts: ['10', '15', '20', '25'], ans: 2, topic: 'Permutations' },
    { q: '⁵C₂ = ?', opts: ['5', '10', '15', '20'], ans: 1, topic: 'Combinations' },
    { q: 'sin²θ + cos²θ = ?', opts: ['0', '1', '2', 'tan²θ'], ans: 1, topic: 'Trigonometry' },
    { q: 'Slope of 3x − 4y + 5 = 0 is:', opts: ['3/4', '−3/4', '4/3', '−4/3'], ans: 0, topic: 'Lines' },
    { q: 'Matrix [[1,0],[0,1]] is called:', opts: ['Zero', 'Identity', 'Scalar', 'Diagonal'], ans: 1, topic: 'Matrices' },
    { q: 'Mean of first 10 natural numbers:', opts: ['4.5', '5', '5.5', '6'], ans: 2, topic: 'Statistics' },
  ],
  '12': [
    { q: '∫ x² dx = ?', opts: ['x³', 'x³/3 + C', '2x', '3x²'], ans: 1, topic: 'Integration' },
    { q: 'd/dx (e^x) = ?', opts: ['xe^(x−1)', 'e^x', 'e^(x−1)', '0'], ans: 1, topic: 'Differentiation' },
    { q: '|A| for A=[[2,1],[4,3]] is:', opts: ['2', '6', '8', '10'], ans: 0, topic: 'Matrices' },
    { q: 'Order of y″ + y′ = x is:', opts: ['1', '2', '3', '0'], ans: 1, topic: 'Differential Equations' },
    { q: 'P(A|B) when P(A∩B)=0.2, P(B)=0.4:', opts: ['0.2', '0.4', '0.5', '0.8'], ans: 2, topic: 'Probability' },
    { q: 'If a × b = 0, vectors are:', opts: ['Perpendicular', 'Parallel', 'Equal', 'Opposite'], ans: 1, topic: 'Vectors' },
    { q: '∫₀¹ x dx = ?', opts: ['0', '1/2', '1', '2'], ans: 1, topic: 'Definite Integrals' },
    { q: 'Inverse of f(x) = 2x + 3 is:', opts: ['(x−3)/2', '(x+3)/2', '2x−3', '(3−x)/2'], ans: 0, topic: 'Relations and Functions' },
    { q: 'Linear programming finds:', opts: ['Average value', 'Optimal value', 'Exact value', 'Random value'], ans: 1, topic: 'Linear Programming' },
    { q: 'In binomial dist, n=10, p=0.4, mean=?', opts: ['2', '4', '6', '8'], ans: 1, topic: 'Probability Distributions' },
  ]
};

let assessAnswers = {};
let currentQ = 0;
let activeQuestions = [];
let studentData = {};

async function startAssessment() {
  const name = (document.getElementById('regName')?.value || '').trim();
  const cls = (document.getElementById('regClass')?.value || '').trim();
  const subject = (document.getElementById('regSubject')?.value || '').trim();
  const board = (document.getElementById('regBoard')?.value || '').trim();
  const mobile = (document.getElementById('regMobile')?.value || '').trim();
  const email = (document.getElementById('regEmail')?.value || '').trim();
  const password = (document.getElementById('regPassword')?.value || '').trim();

  if (!name) { flashField('regName', 'Please enter student name.'); return; }
  if (!cls) { flashField('regClass', 'Please select your class.'); return; }
  if (!board) { flashField('regBoard', 'Please choose the board.'); return; }
  if ((cls === '11' || cls === '12') && !subject) { flashField('regSubject', 'Please choose Maths or Business Maths.'); return; }
  if (mobile.replace(/\D/g, '').length < 10) { flashField('regMobile', 'Enter valid 10-digit mobile.'); return; }
  if (!email || !email.includes('@')) { flashField('regEmail', 'Enter valid email address.'); return; }
  if (password.length < 6) { flashField('regPassword', 'Password must be at least 6 characters.'); return; }

  try {
    await API.registerStudent(name, cls, mobile, email, password, subject || 'maths', board);
  } catch (err) {
    alert(err.message || 'Registration failed. Please try again.');
    return;
  }

  studentData = { name, cls, class: cls, subject: subject || 'maths', board, mobile, email };
  localStorage.setItem('ilearn_student', JSON.stringify(studentData));
  activeQuestions = classQuestions[cls] || classQuestions['9'];
  assessAnswers = {};
  currentQ = 0;
  document.getElementById('testTitle').textContent = 'Class ' + cls + ' Diagnostic Test';
  document.getElementById('testSubtitle').textContent = 'Answer all 10 questions - ' + name;
  showRegStep(2);
  renderQuestion();
}

function flashField(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.style.borderColor = '#FF2D78'; el.focus(); setTimeout(() => el.style.borderColor = '', 3000); }
  alert(msg);
}

function renderQuestion() {
  const q = activeQuestions[currentQ];
  const total = activeQuestions.length;
  const pct = Math.round(currentQ / total * 100);
  document.getElementById('qProgress').textContent = 'Question ' + (currentQ + 1) + ' of ' + total;
  document.getElementById('qPct').textContent = pct + '%';
  document.getElementById('qProgFill').style.width = pct + '%';
  document.getElementById('prevBtn').style.display = currentQ > 0 ? 'inline-block' : 'none';
  document.getElementById('nextBtn').textContent = currentQ === total - 1 ? 'Submit' : 'Next →';
  const sel = assessAnswers[currentQ];
  document.getElementById('questionArea').innerHTML = `
    <div style="background:var(--dark3);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px;">
      <div style="font-size:0.7rem;color:var(--pink);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">${q.topic}</div>
      <div style="font-size:0.94rem;line-height:1.6;margin-bottom:16px;color:var(--text);">${currentQ + 1}. ${q.q}</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${q.opts.map((opt, i) => `
          <div onclick="selectQ(${i})" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:${sel === i ? 'rgba(255,45,120,0.12)' : 'rgba(255,255,255,0.02)'};border:1px solid ${sel === i ? 'var(--pink)' : 'rgba(255,255,255,0.08)'};border-radius:10px;cursor:pointer;font-size:0.88rem;transition:all 0.2s;">
            <div style="width:16px;height:16px;border-radius:50%;border:2px solid ${sel === i ? 'var(--pink)' : 'rgba(255,255,255,0.25)'};background:${sel === i ? 'var(--pink)' : 'transparent'};flex-shrink:0;transition:all 0.2s;"></div>
            ${opt}
          </div>`).join('')}
      </div>
    </div>`;
}

function selectQ(idx) { assessAnswers[currentQ] = idx; renderQuestion(); }
function nextQ() {
  if (assessAnswers[currentQ] === undefined) { alert('Please select an answer before continuing.'); return; }
  if (currentQ === activeQuestions.length - 1) { showResult(); } else { currentQ++; renderQuestion(); }
}
function prevQ() { if (currentQ > 0) { currentQ--; renderQuestion(); } }

function showResult() {
  const total = activeQuestions.length;
  const correct = activeQuestions.filter((q, i) => assessAnswers[i] === q.ans).length;
  const pct = Math.round(correct / total * 100);
  const topicScores = {};
  activeQuestions.forEach((q, i) => {
    if (!topicScores[q.topic]) topicScores[q.topic] = { c: 0, t: 0 };
    topicScores[q.topic].t++;
    if (assessAnswers[i] === q.ans) topicScores[q.topic].c++;
  });
  const weakTopics = Object.entries(topicScores).filter(([, s]) => s.c / s.t < 0.6).map(([t]) => t);
  const strongTopics = Object.entries(topicScores).filter(([, s]) => s.c / s.t >= 0.8).map(([t]) => t);
  const scoreCol = pct >= 70 ? '#00E5A0' : pct >= 50 ? '#FFD166' : '#FF2D78';
  const grade = pct >= 80 ? 'Excellent 🏆' : pct >= 60 ? 'Good 👍' : pct >= 40 ? 'Average 💪' : 'Needs Work 📚';

  document.getElementById('resultScore').innerHTML = '<span style="color:' + scoreCol + '">' + pct + '%</span>';
  document.getElementById('resultGrade').textContent = grade;
  document.getElementById('resultNote').textContent = correct + ' of ' + total + ' correct • Class ' + studentData.cls + ' Diagnostic';
  document.getElementById('resultGrid').innerHTML =
    '<div class="rbox good"><div class="rbox-title good">✓ Strong Topics</div>' +
    (strongTopics.length ? strongTopics.map(t => '<div class="rbox-item">• ' + t + '</div>').join('') : '<div class="rbox-item">Keep practicing!</div>') + '</div>' +
    '<div class="rbox weak"><div class="rbox-title weak">⚠ Needs Focus</div>' +
    (weakTopics.length ? weakTopics.map(t => '<div class="rbox-item">• ' + t + '</div>').join('') : '<div class="rbox-item">Great performance!</div>') + '</div>';
  document.getElementById('topicBars').innerHTML = Object.entries(topicScores).map(([topic, s]) => {
    const p = Math.round(s.c / s.t * 100);
    const col = p >= 70 ? '#00E5A0' : p >= 50 ? '#FFD166' : '#FF2D78';
    return '<div class="t-bar-wrap"><div class="t-bar-top"><span>' + topic + '</span><span style="color:' + col + '">' + p + '%</span></div><div class="t-bar"><div class="t-bar-fill" style="width:' + p + '%;background:' + col + '"></div></div></div>';
  }).join('');
  document.getElementById('aiTip').innerHTML = '🤖 <strong>AI Recommendation:</strong> Focus extra time on <strong>' + (weakTopics.length ? weakTopics.slice(0, 2).join(' and ') : 'all topics equally') + '</strong>. Use the AI Timetable Generator to build your personalised study plan.';
  showRegStep(3);
}

// ── AI CHATBOT ────────────────────────────────────────────────────────────────
const chatHistory = [];

async function sendChat() {
  const input = document.getElementById('chatInput');
  const chatBody = document.getElementById('chatBody');
  if (!input || !chatBody) return;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  chatHistory.push({ role: 'user', content: q });
  chatBody.innerHTML += `<div class="msg user"><div class="msg-ava" style="background:rgba(255,45,120,0.2)">👤</div><div class="msg-bubble">${esc(q)}</div></div>`;
  const tid = 'typing_' + Date.now();
  chatBody.innerHTML += `<div class="msg bot" id="${tid}"><div class="msg-ava">🤖</div><div class="typing"><span></span><span></span><span></span></div></div>`;
  chatBody.scrollTop = chatBody.scrollHeight;
  try {
    const data = await API.sendChatMessage(q);
    const reply = data.reply || 'Sorry, please try again!';
    chatHistory.push({ role: 'assistant', content: reply });
    if (data.sessionKey) localStorage.setItem('ilearn_chat_session', data.sessionKey);
    document.getElementById(tid)?.remove();
    chatBody.innerHTML += `<div class="msg bot"><div class="msg-ava">🤖</div><div class="msg-bubble">${fmt(reply)}</div></div>`;
  } catch (e) {
    document.getElementById(tid)?.remove();
    chatBody.innerHTML += `<div class="msg bot"><div class="msg-ava">🤖</div><div class="msg-bubble">${fmt(e.message || 'Connection error. Please try again.')}</div></div>`;
  }
  chatBody.scrollTop = chatBody.scrollHeight;
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
}

document.addEventListener('click', (event) => {
  const menu = document.getElementById('profileMenu');
  const panel = document.getElementById('profilePanel');
  if (!menu || !panel) return;
  if (!menu.contains(event.target)) panel.classList.remove('open');
});

function getStoredProfileState(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}

function getCurrentRole() {
  if (hasActiveTeacherSession()) return 'teacher';
  if (hasActiveStudentSession()) return 'student';
  if (hasActiveParentSession()) return 'parent';
  return null;
}

function getProfileData() {
  const role = getCurrentRole();
  if (!role) return null;
  if (role === 'student') {
    const data = getStoredProfileState('ilearn_student_profile');
    const student = data.student || getStoredProfileState('ilearn_student');
    const present = Number(data.attendance?.present || 0);
    const total = Number(data.totalAttendance?.total || 0);
    const percentage = total ? Math.round((present / total) * 1000) / 10 : 0;
    return {
      role, title: student.name || 'Student', subtitle: 'Student',
      items: [
        { label: 'Role', value: 'Student' },
        { label: 'Class', value: student.class ? 'Class ' + student.class : 'Not available' },
        { label: 'Email', value: student.email || 'Not available' },
        { label: 'Attendance', value: total ? `${percentage}% (${present}/${total})` : 'No attendance yet' }
      ]
    };
  }
  if (role === 'parent') {
    const data = getStoredProfileState('ilearn_parent_profile');
    const student = data.student || getStoredProfileState('ilearn_parent_student');
    const monthAtt = data.report?.attendanceSummary?.month || data.report?.attendance || data.attendance || {};
    const present = Number(monthAtt.present || 0);
    const total = Number(monthAtt.total || 0);
    const percentage = total ? Math.round((present / total) * 1000) / 10 : 0;
    return {
      role, title: 'Parent', subtitle: student.name ? 'Parent of ' + student.name : 'Parent',
      items: [
        { label: 'Role', value: 'Parent' },
        { label: 'Student', value: student.name || 'Linked student' },
        { label: 'Class', value: student.class ? 'Class ' + student.class : 'Not available' },
        { label: 'Email', value: student.email || 'Not available' },
        { label: 'Subject', value: student.subject || 'Maths' },
        { label: 'Board', value: student.board || 'Not available' },
        { label: 'Attendance', value: total ? `${percentage}% (${present}/${total})` : 'No attendance yet' }
      ]
    };
  }
  const teacher = getStoredProfileState('ilearn_teacher');
  return {
    role, title: teacher.name || 'Teacher', subtitle: 'Teacher',
    items: [
      { label: 'Role', value: 'Teacher' },
      { label: 'Name', value: teacher.name || 'Master Maths Staff' },
      { label: 'Email', value: teacher.email || 'Not available' },
      { label: 'Access', value: 'Teacher Dashboard' }
    ]
  };
}

function renderNavProfile() {
  const profileMenu = document.getElementById('profileMenu');
  const profilePanel = document.getElementById('profilePanel');
  const loginBtn = document.getElementById('navLoginBtn');
  const registerBtn = document.getElementById('navRegisterBtn');
  const profile = getProfileData();
  if (!profileMenu || !profilePanel || !loginBtn || !registerBtn) return;
  if (!profile) {
    profileMenu.style.display = 'none';
    loginBtn.style.display = '';
    registerBtn.style.display = '';
    profilePanel.classList.remove('open');
    return;
  }
  loginBtn.style.display = 'none';
  registerBtn.style.display = 'none';
  profileMenu.style.display = 'block';
  const logoutFn = profile.role === 'student' ? 'API.logoutStudent()' : (profile.role === 'parent' ? 'API.logoutParent()' : 'API.logoutTeacher()');
  profilePanel.innerHTML = `
    <h4>${profile.title}</h4>
    <p>${profile.subtitle}</p>
    ${profile.items.map((item) => `<div class="profile-row"><div class="profile-label">${item.label}</div><div class="profile-value">${item.value}</div></div>`).join('')}
    <button class="profile-logout" onclick="${logoutFn}">Logout</button>
  `;
}

async function loginTeacher() {
  const email = (document.getElementById('lt-email')?.value || '').trim();
  const password = (document.getElementById('lt-password')?.value || '').trim();
  clearLoginError();
  if (!email || !password) { showLoginError('Please enter the teacher email and password.'); return; }
  try {
    const data = await API.loginTeacher(email, password);
    closeLoginModal();
    localStorage.setItem('ilearn_teacher', JSON.stringify(data.teacher || {}));
    redirectToTeacherDashboard();
  } catch (err) {
    showLoginError(err.message || 'Teacher login failed');
  }
}

// ── PARENT DASHBOARD REFRESH ──────────────────────────────────────────────────
async function refreshParentDashboard() {
  if (!hasActiveParentSession()) return;
  try {
    // Single API call gets everything the parent tab needs
    const apiResponse = await API.getParentReport();
 
    // apiResponse shape from server:
    // { student, report: { ...all fields }, ...flatFields (same fields at top level) }
    const student = apiResponse.student || {};
    const report  = apiResponse.report  || apiResponse; // works whether nested or flat
 
    // Persist for offline reads by updateDashboardAttendanceCards
    localStorage.setItem('ilearn_parent_profile',  JSON.stringify(apiResponse));
    localStorage.setItem('ilearn_parent_student',  JSON.stringify(student));
 
    // ── Inject all data into the parent tab widgets ──
    // injectParentTabData in dashboard-auth.js accepts the raw API response
    // and handles both the nested (report.report.X) and flat (report.X) shapes.
    if (typeof injectParentTabData === 'function') {
      injectParentTabData(apiResponse, student);
    }
 
    // ── Update the top-level welcome/attendance cards ──
    updateDashboardAttendanceCards();
    renderNavProfile();
 
  } catch (err) {
    console.warn('Parent dashboard refresh failed:', err.message || err);
  }
}

function deriveParentReportFromStudentState() {
  const studentProfile = getStoredProfileState('ilearn_student_profile');
  if (!Object.keys(studentProfile || {}).length) return {};
  return buildStudentParentView(studentProfile);
}

function buildStudentParentView(profile) {
  const student = profile.student || {};
  const latestAssessment = profile.latestAssessment || null;
  const topicScores = latestAssessment?.topic_scores ? JSON.parse(latestAssessment.topic_scores || '{}') : {};
  const weakTopics = latestAssessment?.weak_topics ? JSON.parse(latestAssessment.weak_topics || '[]') : [];
  const strongTopics = latestAssessment?.strong_topics ? JSON.parse(latestAssessment.strong_topics || '[]') : [];
  const dailyMcqSet = profile.dailyMcqSet || { questions: [] };
  const recentMcqs = Array.isArray(dailyMcqSet.questions)
    ? dailyMcqSet.questions.filter((item) => item.selected_index !== null && item.selected_index !== undefined)
    : [];
  const report = {
    student,
    latestAssessment,
    attendance: profile.attendance || {},
    totalAttendance: profile.totalAttendance || {},
    attendanceSummary: profile.attendanceSummary || {},
    weeklySummary: profile.weeklySummary || null,
    dailyMcqSet,
    questionPapers: profile.questionPapers || [],
    weeklyTests: profile.weeklyTests || [],
    feeSummary: profile.feeSummary || null,
    mcqStreak: profile.mcqStreak || 0,
    topicScores,
    weakTopics,
    strongTopics,
    recentMcqs: profile.recentMcqs || recentMcqs
  };
  return { student, report, ...report };
}

async function refreshStudentParentDashboard() {
  if (!hasActiveStudentSession()) return;
  try {
    const profile = await API.getStudentProfile();
    localStorage.setItem('ilearn_student_profile', JSON.stringify(profile));
    if (!Object.keys(profile || {}).length) return;
    const parentView = buildStudentParentView(profile);
    localStorage.setItem('ilearn_parent_profile', JSON.stringify(parentView));
    localStorage.setItem('ilearn_parent_student', JSON.stringify(parentView.student || {}));
    if (typeof injectParentTabData === 'function') {
      injectParentTabData(parentView.report, parentView.student);
    }
    await renderStudentDashboardCards(profile);
    renderNavProfile();
  } catch (err) {
    console.warn('Student dashboard support refresh failed:', err.message || err);
  }
}

async function refreshRoleData() {
  const role = getCurrentRole();
  try {
    if (role === 'student') {
      const profile = await API.getStudentProfile();
      localStorage.setItem('ilearn_student_profile', JSON.stringify(profile));
      const parentView = buildStudentParentView(profile);
      localStorage.setItem('ilearn_parent_profile', JSON.stringify(parentView));
      localStorage.setItem('ilearn_parent_student', JSON.stringify(parentView.student || {}));
      try {
        const timetable = await API.getLatestTimetable();
        localStorage.setItem('ilearn_student_timetable', JSON.stringify(timetable));
      } catch (innerErr) {
        console.warn('Timetable refresh skipped:', innerErr.message || innerErr);
      }
      await renderStudentDashboardCards(profile);
    } else if (role === 'parent') {
      await refreshParentDashboard();
      return;
    } else if (role === 'teacher') {
      const teacher = JSON.parse(localStorage.getItem('ilearn_teacher') || '{}');
      localStorage.setItem('ilearn_teacher', JSON.stringify(teacher));
    }
  } catch (err) {
    if (role === 'student') {
      const message = err.message || 'Could not load student profile.';
      setElementText('studentAttendanceHint', message);
      setElementText('parentFeeStatus', message.includes('blocked by the teacher') ? 'Blocked by teacher' : 'Update unavailable');
      const studentStored = getStoredProfileState('ilearn_student');
      if (studentStored?.class) {
        setElementText('parentFeeBatch', `Class ${studentStored.class}`);
      }
      if (message.includes('blocked by the teacher') || message.includes('Session expired')) {
        localStorage.removeItem('ilearn_student_profile');
        localStorage.removeItem('ilearn_student_timetable');
        localStorage.removeItem('ilearn_parent_profile');
        localStorage.removeItem('ilearn_parent_student');
        localStorage.removeItem('ilearn_token');
        localStorage.removeItem('ilearn_student');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 800);
      }
    }
    console.warn('Profile refresh skipped:', err.message || err);
  }
  if (role !== 'student') {
    updateDashboardAttendanceCards();
    renderTodayTimetableReminder();
  }
}

function renderStudentAttendanceCard(profile, now) {
  const month = profile?.attendanceSummary?.month || {};
  const overall = profile?.attendanceSummary?.overall || {};
  setElementText('studentAttendanceMonth', `${month.present || 0} / ${month.total || 0} days`);
  setElementText('studentAttendanceOverall', `${overall.percentage || 0}%`);
  setElementText('studentAttendanceProgressLabel', `${overall.percentage || 0}%`);
  setElementWidth('studentAttendanceProgress', `${Math.max(0, Math.min(100, Number(overall.percentage || 0)))}%`);
  setElementText('studentAttendanceHint', overall.total
    ? `Teacher attendance source: ${overall.present}/${overall.total} classes marked.`
    : 'Teacher attendance source: no attendance entries yet.');
  setUpdatedLabel('studentAttendanceUpdated', now);
}

function renderStudentStreakCard(profile, now) {
  const streakValue = Number(profile.mcqStreak || 0);
  setElementText('studentStreakValue', streakValue + ' day' + (streakValue === 1 ? '' : 's'));
  setUpdatedLabel('studentStreakUpdated', now);
}

function renderStudentFeeCardData(student, feeSummary, now) {
  setElementText('parentFeeBatch', student?.class ? `Class ${student.class}` : 'Class --');
  const pendingAmt = Number(feeSummary?.pending || 0);
  setElementText('parentFeeStatus', feeSummary ? (pendingAmt > 0 ? `Rs ${pendingAmt} pending` : 'Paid up') : 'No entries yet');
  setElementText('parentFeePaid', `Rs ${feeSummary?.totalPaid || 0}`);
  setElementText('parentFeePending', `Rs ${feeSummary?.pending || 0}`);
  const feeLastPaidRow = document.getElementById('parentFeeLastPaid');
  if (feeLastPaidRow) {
    const lastPayment = Array.isArray(feeSummary?.payments) && feeSummary.payments.length ? feeSummary.payments[0] : null;
    feeLastPaidRow.innerHTML = `<span class="metric-label">Last Paid</span><span class="metric-value">${lastPayment ? `${lastPayment.paid_on} - Rs ${lastPayment.amount_paid}` : '-'}</span>`;
  }
  setUpdatedLabel('parentFeeUpdated', now);
}

function renderStudentWeeklyTestCardData(weeklyTests, now) {
  const wrap = document.getElementById('parentWeeklyTests');
  if (!wrap) return;
  const tests = Array.isArray(weeklyTests) ? weeklyTests : [];
  if (!tests.length) {
    wrap.innerHTML = '<div style="color:var(--muted);font-size:0.88rem;">Weekly test marks will appear here once teachers enter them.</div>';
    setUpdatedLabel('parentWeeklyTestsUpdated', now);
    return;
  }
  wrap.innerHTML = tests.slice(0, 5).map((test) => `
    <div class="metric-row">
      <div>
        <div class="metric-value">${test.title || 'Weekly Test'}</div>
        <div class="metric-label">${test.test_date || ''}${test.notes ? ' - ' + test.notes : ''}</div>
      </div>
      <span class="metric-value">${Number(test.marks_obtained || 0)}/${Number(test.total_marks || 0)}</span>
    </div>
  `).join('');
  setUpdatedLabel('parentWeeklyTestsUpdated', now);
}

function renderStudentTopicCardsData(payload) {
  const topicWrap = document.getElementById('parentTopicProgress');
  const strongWrap = document.getElementById('parentStrongTopics');
  const weakWrap = document.getElementById('parentWeakTopics');
  if (!topicWrap && !strongWrap && !weakWrap) return;

  const weeklyTests = Array.isArray(payload.weeklyTests) ? payload.weeklyTests : [];
  const overallAttendance = Number(payload.attendanceSummary?.overall?.percentage || 0);
  const feeSummary = payload.feeSummary || null;
  const averageScore = weeklyTests.length
    ? Math.round(weeklyTests.reduce((sum, test) => {
        const total = Number(test.total_marks || 0);
        const marks = Number(test.marks_obtained || 0);
        return sum + (total ? ((marks / total) * 100) : 0);
      }, 0) / weeklyTests.length)
    : 0;
  const pendingFees = Number(feeSummary?.pending || 0);

  if (topicWrap) {
    topicWrap.innerHTML = weeklyTests.length
      ? `
        <div class="progress-bar-wrap">
          <div class="progress-label"><span>Average Weekly Test Score</span><span>${averageScore}%</span></div>
          <div class="progress-bar"><div class="progress-fill purple" style="width:${Math.max(0, Math.min(100, averageScore))}%"></div></div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-label"><span>Attendance Consistency</span><span>${overallAttendance}%</span></div>
          <div class="progress-bar"><div class="progress-fill blue" style="width:${Math.max(0, Math.min(100, overallAttendance))}%"></div></div>
        </div>
      `
      : '<div style="color:var(--muted);font-size:0.88rem;">Topic-wise progress will appear here after your latest teacher-entered tests.</div>';
  }

  if (strongWrap) {
    const strongItems = [];
    if (averageScore >= 75) strongItems.push('Weekly test accuracy');
    if (overallAttendance >= 85) strongItems.push('Attendance consistency');
    if (pendingFees === 0 && feeSummary) strongItems.push('Fee status is clear');
    strongWrap.innerHTML = strongItems.length
      ? strongItems.map((item) => `<div class="alert-pill blue"><div class="alert-title blue">${item}</div><div class="alert-desc">This area is looking healthy right now.</div></div>`).join('')
      : '<span style="color:#8888AA;font-size:0.88rem;">Strong areas will appear once more data builds up.</span>';
  }

  if (weakWrap) {
    const weakItems = [];
    if (weeklyTests.length && averageScore < 75) weakItems.push('Weekly test follow-up');
    if (overallAttendance < 85) weakItems.push('Attendance follow-up');
    if (pendingFees > 0) weakItems.push('Fee pending');
    weakWrap.innerHTML = weakItems.length
      ? weakItems.map((item) => `<div class="alert-pill pink"><div class="alert-title pink">${item}</div><div class="alert-desc">This needs attention in the current flow.</div></div>`).join('')
      : '<span style="color:#8888AA;font-size:0.88rem;">No urgent weak areas flagged right now.</span>';
  }
}

async function renderStudentDashboardCards(profile) {
  const now = new Date();
  const student = profile?.student || getStoredProfileState('ilearn_student');
  setElementText('dashboardWelcomeName', student?.name || 'Student');
  setElementText('dashboardWelcomeRole', 'Signed in as student');
  setUpdatedLabel('dashboardWelcomeUpdated', now);
  const [attendanceData, feeData, weeklyData] = await Promise.all([
    API.getStudentAttendanceCard().catch(() => ({
      student,
      attendanceSummary: profile?.attendanceSummary || {},
      weeklySummary: profile?.weeklySummary?.attendance || null
    })),
    API.getStudentFeeCard().catch(() => ({
      student,
      feeSummary: profile?.feeSummary || null
    })),
    API.getStudentWeeklyTestCard().catch(() => ({
      student,
      weeklyTests: profile?.weeklyTests || [],
      topicScores: {},
      weakTopics: [],
      strongTopics: []
    }))
  ]);

  renderStudentAttendanceCard({
    attendanceSummary: attendanceData.attendanceSummary || profile?.attendanceSummary || {}
  }, now);
  renderStudentStreakCard(profile, now);
  renderStudentFeeCardData(feeData.student || student, feeData.feeSummary || profile?.feeSummary || null, now);
  renderStudentWeeklyTestCardData(weeklyData.weeklyTests || profile?.weeklyTests || [], now);
  renderStudentTopicCardsData({
    weeklyTests: weeklyData.weeklyTests || profile?.weeklyTests || [],
    attendanceSummary: attendanceData.attendanceSummary || profile?.attendanceSummary || {},
    feeSummary: feeData.feeSummary || profile?.feeSummary || null,
    topicScores: weeklyData.topicScores || {},
    weakTopics: weeklyData.weakTopics || [],
    strongTopics: weeklyData.strongTopics || []
  });
  renderTodayTimetableReminder();
}

// ── HELPER FUNCTIONS ──────────────────────────────────────────────────────────
function setElementText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}
function setElementWidth(id, value) {
  const node = document.getElementById(id);
  if (node) node.style.width = value;
}
function formatUpdatedLabel(dateObj) {
  const date = dateObj || new Date();
  return 'Last updated: ' + date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function setUpdatedLabel(id, dateObj) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = formatUpdatedLabel(dateObj);
}
function getTodayTimetableDayKey() {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
}
function getTimetableSlotClass(type) {
  const value = String(type || '').toLowerCase();
  if (value === 'study') return 'var(--pink)';
  if (value === 'practice') return 'var(--blue)';
  if (value === 'revision') return 'var(--green)';
  if (value === 'doubt') return 'var(--purple)';
  if (value === 'test') return '#FFD166';
  return 'var(--blue)';
}
function renderTodayTimetableReminder() {
  const wrap = document.getElementById('studentTodayTimetable');
  if (!wrap) return;
  const timetableState = getStoredProfileState('ilearn_student_timetable');
  const schedule = timetableState.timetable?.schedule || timetableState.schedule || {};
  const weeklyPlan = schedule.weeklyPlan || schedule.week || {};
  const todayKey = getTodayTimetableDayKey();
  const todaySlots = Array.isArray(weeklyPlan[todayKey]) ? weeklyPlan[todayKey] : [];
  if (!todaySlots.length) {
    wrap.innerHTML = '<div class="tt-slot"><div class="tt-dot" style="background:var(--blue)"></div><div class="tt-time">' + todayKey + '</div><div>No timetable slots planned for today yet.</div></div>';
    return;
  }
  wrap.innerHTML = todaySlots.slice(0, 4).map((slot) => {
    const time = slot.time || 'Study Slot';
    const topic = slot.topic || 'Maths Practice';
    const type = slot.type ? ' - ' + slot.type.charAt(0).toUpperCase() + slot.type.slice(1) : '';
    return '<div class="tt-slot"><div class="tt-dot" style="background:' + getTimetableSlotClass(slot.type) + '"></div><div class="tt-time">' + time + '</div><div>' + topic + type + '</div></div>';
  }).join('');
}

function updateDashboardAttendanceCards() {
  const now  = new Date();
  const role = getCurrentRole();
 
  // ── Read cached data ──
  const studentProfile = getStoredProfileState('ilearn_student_profile');
  const studentStored  = getStoredProfileState('ilearn_student');
  // Parent profile is the raw API response stored by refreshParentDashboard
  const parentApiResponse = getStoredProfileState('ilearn_parent_profile');
  const parentStored      = getStoredProfileState('ilearn_parent_student');
  const teacherStored     = getStoredProfileState('ilearn_teacher');
 
  // ── Welcome banner ──
  const welcomeName = role === 'student'
    ? (studentProfile.student?.name || studentStored.name || 'Student')
    : role === 'parent'
      ? (parentApiResponse.student?.name || parentStored.name || 'Parent')
      : role === 'teacher'
        ? (teacherStored.name || 'Teacher')
        : 'Learner';
 
  setElementText('dashboardWelcomeName',    welcomeName || 'Learner');
  setElementText('dashboardWelcomeRole',    role ? `Signed in as ${role}` : 'Sign in to view your dashboard');
  setUpdatedLabel('dashboardWelcomeUpdated', now);

  if (role === 'student' && Object.keys(studentProfile || {}).length) {
    renderStudentDashboardCards(studentProfile).catch((err) => {
      console.warn('Student card render failed:', err.message || err);
    });
    return;
  }
 
  // ── Student attendance card ──
  const studentMonth   = studentProfile.attendanceSummary?.month   || null;
  const studentOverall = studentProfile.attendanceSummary?.overall || null;
  if (studentMonth || studentOverall) {
    setElementText('studentAttendanceMonth',         `${studentMonth?.present || 0} / ${studentMonth?.total || 0} days`);
    setElementText('studentAttendanceOverall',       `${studentOverall?.percentage || 0}%`);
    setElementText('studentAttendanceProgressLabel', `${studentOverall?.percentage || 0}%`);
    setElementWidth('studentAttendanceProgress',     `${Math.max(0, Math.min(100, Number(studentOverall?.percentage || 0)))}%`);
    setElementText('studentAttendanceHint', studentOverall?.total
      ? `Overall attendance: ${studentOverall.present}/${studentOverall.total} classes marked.`
      : 'Attendance will appear here once your teacher starts marking it.');
  }
  setUpdatedLabel('studentAttendanceUpdated', now);
 
  // ── Student MCQ streak ──
  const streakValue = Number(studentProfile.mcqStreak || 0);
  setElementText('studentStreakValue', streakValue + ' day' + (streakValue === 1 ? '' : 's'));
  setUpdatedLabel('studentStreakUpdated', now);

  if (role === 'student') {
    const feeSummary = studentProfile.feeSummary || null;
    const feeStudent = studentProfile.student || studentStored || {};
    if (feeSummary || feeStudent?.class) {
      setElementText('parentFeeBatch', feeStudent?.class ? `Class ${feeStudent.class}` : 'Class --');
      const pendingAmt = Number(feeSummary?.pending || 0);
      setElementText('parentFeeStatus', feeSummary ? (pendingAmt > 0 ? `Rs ${pendingAmt} pending` : 'Paid up') : 'No entries yet');
      setElementText('parentFeePaid', `Rs ${feeSummary?.totalPaid || 0}`);
      setElementText('parentFeePending', `Rs ${feeSummary?.pending || 0}`);
      const feeLastPaidRow = document.getElementById('parentFeeLastPaid');
      if (feeLastPaidRow) {
        const lastPayment = Array.isArray(feeSummary?.payments) && feeSummary.payments.length ? feeSummary.payments[0] : null;
        feeLastPaidRow.innerHTML = `<span class="metric-label">Last Paid</span><span class="metric-value">${lastPayment ? `${lastPayment.paid_on} - Rs ${lastPayment.amount_paid}` : '-'}</span>`;
      }
      setUpdatedLabel('parentFeeUpdated', now);
    }
    renderStudentWeeklyTestCardData(studentProfile.weeklyTests || [], now);
    renderStudentTopicCardsData({
      weeklyTests: studentProfile.weeklyTests || [],
      attendanceSummary: studentProfile.attendanceSummary || {},
      feeSummary: studentProfile.feeSummary || null,
      topicScores: {},
      weakTopics: [],
      strongTopics: []
    });
  } else {
    const derivedParentState = role === 'student' ? deriveParentReportFromStudentState() : {};
    const effectiveParentApiResponse = Object.keys(parentApiResponse || {}).length ? parentApiResponse : derivedParentState;
    const parentReport  = effectiveParentApiResponse.report || effectiveParentApiResponse;
    const parentStudent = effectiveParentApiResponse.student || parentStored || studentProfile.student || studentStored;
    const feeSummary = parentReport?.feeSummary || studentProfile.feeSummary || null;
    const feeStudent = parentStudent?.class ? parentStudent : (studentProfile.student || studentStored || {});
    if (feeSummary || feeStudent?.class) {
      setElementText('parentFeeBatch', feeStudent?.class ? `Class ${feeStudent.class}` : 'Class --');
      const pendingAmt = Number(feeSummary?.pending || 0);
      setElementText('parentFeeStatus', feeSummary ? (pendingAmt > 0 ? `Rs ${pendingAmt} pending` : 'Paid up') : 'No entries yet');
      setElementText('parentFeePaid', `Rs ${feeSummary?.totalPaid || 0}`);
      setElementText('parentFeePending', `Rs ${feeSummary?.pending || 0}`);
      setUpdatedLabel('parentFeeUpdated', now);
    }
    if ((role === 'parent' || role === 'student') && Object.keys(effectiveParentApiResponse || {}).length) {
      if (typeof injectParentTabData === 'function') {
        injectParentTabData(parentReport, parentStudent);
      }
    }
  }
 
  renderTodayTimetableReminder();
}
// ── FIX: updateHomeForSession — force teacher tab with inline styles, no CSS class race ──
function updateHomeForSession() {
  const role = getCurrentRole();

  // Show/hide role-specific sections using inline styles (overrides CSS class hiding)
  document.querySelectorAll('.role-student-only').forEach((el) => {
    el.style.display = (!role || role === 'student') ? '' : 'none';
  });
  document.querySelectorAll('.role-parent-only').forEach((el) => {
    el.style.display = role === 'parent' ? '' : 'none';
  });
  // IMPORTANT: for teacher role, force ALL role-teacher-only elements visible
  document.querySelectorAll('.role-teacher-only').forEach((el) => {
    el.style.display = role === 'teacher' ? '' : 'none';
    if (role === 'teacher') {
      el.style.visibility = 'visible';
      el.style.opacity = '1';
    }
  });

  // Hide assessment and AI features sections for teacher
  [document.getElementById('assessment'), document.getElementById('ai-features')].forEach((section) => {
    if (section) section.style.display = role === 'teacher' ? 'none' : '';
  });

  // Get tab and content elements
  const studentTab     = document.getElementById('studentDashTab');
  const teacherTab     = document.getElementById('teacherDashTab');
  const studentContent = document.getElementById('tab-student');
  const teacherContent = document.getElementById('tab-teacher');

  // Reset all tabs and contents
  [studentTab, teacherTab].forEach(t => {
    if (t) { t.classList.remove('active'); t.style.display = 'none'; }
  });
  [studentContent, teacherContent].forEach(c => {
    if (c) { c.classList.remove('active'); c.style.display = 'none'; }
  });

  if (role === 'teacher') {
    // Force teacher tab visible — override ALL CSS that might hide it
    if (teacherTab) {
      teacherTab.style.cssText = 'display:inline-block !important; visibility:visible !important; opacity:1 !important;';
      teacherTab.classList.add('active');
    }
    // Show teacher content
    if (teacherContent) {
      teacherContent.classList.add('active');
      teacherContent.style.cssText = 'display:grid !important; visibility:visible !important; opacity:1 !important;';
    }
  } else if (role === 'student') {
    if (studentTab) { studentTab.style.display = 'inline-block'; studentTab.classList.add('active'); }
    if (teacherTab) { teacherTab.style.display = 'none'; teacherTab.classList.remove('active'); }
    if (studentContent) { studentContent.classList.add('active'); studentContent.style.display = 'grid'; }
    if (teacherContent) { teacherContent.classList.remove('active'); teacherContent.style.display = 'none'; }
  } else if (role === 'parent') {
    if (studentTab) { studentTab.style.display = 'inline-block'; studentTab.classList.add('active'); }
    if (teacherTab) { teacherTab.style.display = 'none'; teacherTab.classList.remove('active'); }
    if (studentContent) { studentContent.classList.add('active'); studentContent.style.display = 'grid'; }
    if (teacherContent) { teacherContent.classList.remove('active'); teacherContent.style.display = 'none'; }
  } else {
    // No role — show all tabs, student active by default
    [studentTab, teacherTab].forEach(t => { if (t) t.style.display = 'inline-block'; });
    if (studentTab) studentTab.classList.add('active');
    if (studentContent) { studentContent.classList.add('active'); studentContent.style.display = 'grid'; }
  }

  renderNavProfile();
  updateAuthRequiredState();
  updateDashboardAttendanceCards();
}

// ── TEACHER FUNCTIONS ─────────────────────────────────────────────────────────
function setDefaultTeacherDate() {
  const input = document.getElementById('teacherAttendanceDate');
  if (!input || input.value) return;
  const today = new Date();
  const localDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
  input.value = localDate;
}

let teacherStudentCache = [];

let teacherMcqGenerationContext = null;

function normalizeTeacherMcqOption(option) {
  if (typeof option === 'string') return { text: option, imageUrl: '' };
  return {
    text: String(option?.text || '').trim(),
    imageUrl: String(option?.imageUrl || '').trim()
  };
}

function renderTeacherMcqCards(count = 2, presetQuestions = []) {
  const wrap = document.getElementById('teacherMcqCards');
  if (!wrap) return;
  const safeCount = Math.max(1, Math.min(20, Number(count) || 2));
  const countInput = document.getElementById('teacherMcqCount');
  if (countInput) countInput.value = safeCount;
  wrap.innerHTML = Array.from({ length: safeCount }, (_, index) => `
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:16px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <div style="font-size:0.78rem;color:var(--blue);font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Question ${index + 1}</div>
        <button type="button" class="btn-outline-sm" onclick="regenerateTeacherMcqQuestion(${index + 1})">Regenerate</button>
      </div>
      <div class="form-group" style="margin:0 0 10px 0;"><label>Question Text</label><textarea id="teacherMcqQuestion${index + 1}" rows="3" placeholder="Enter question ${index + 1}"></textarea></div>
      <div class="form-group" style="margin:0 0 10px 0;">
        <label>Question Image</label>
        <input type="text" id="teacherMcqQuestionImage${index + 1}" data-preview-id="teacherMcqQuestionImagePreview${index + 1}" placeholder="Paste image URL/path or press Ctrl+V to paste image" onpaste="handleTeacherImagePaste(event, this)" oninput="updateTeacherImagePreview(this)" />
        <div id="teacherMcqQuestionImagePreview${index + 1}" style="display:none;margin-top:10px;"></div>
      </div>
      ${[1, 2, 3, 4].map((optionNumber) => `
        <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:10px;">
          <div class="form-group" style="margin:0;"><label>Option ${optionNumber} Text</label><input type="text" id="teacherMcq${index + 1}Option${optionNumber}" placeholder="Option ${optionNumber} text" /></div>
          <div class="form-group" style="margin:0;">
            <label>Option ${optionNumber} Image</label>
            <input type="text" id="teacherMcq${index + 1}Option${optionNumber}Image" data-preview-id="teacherMcq${index + 1}Option${optionNumber}ImagePreview" placeholder="Paste image URL/path or press Ctrl+V to paste image" onpaste="handleTeacherImagePaste(event, this)" oninput="updateTeacherImagePreview(this)" />
            <div id="teacherMcq${index + 1}Option${optionNumber}ImagePreview" style="display:none;margin-top:10px;"></div>
          </div>
        </div>
      `).join('')}
      <div class="form-group" style="margin:0;"><label>Correct Option</label>
        <select id="teacherMcq${index + 1}Correct"><option value="0">Option 1</option><option value="1">Option 2</option><option value="2">Option 3</option><option value="3">Option 4</option></select>
      </div>
    </div>
  `).join('');

  presetQuestions.slice(0, safeCount).forEach((question, index) => {
    fillTeacherMcqCard(index + 1, question);
  });
}

function regenerateTeacherMcqCards() {
  const count = document.getElementById('teacherMcqCount')?.value || 2;
  teacherMcqGenerationContext = null;
  renderTeacherMcqCards(count);
}

function fillTeacherMcqCard(cardNumber, questionData) {
  const normalizedOptions = Array.isArray(questionData?.options)
    ? questionData.options.map(normalizeTeacherMcqOption)
    : [];
  const questionNode = document.getElementById(`teacherMcqQuestion${cardNumber}`);
  const questionImageNode = document.getElementById(`teacherMcqQuestionImage${cardNumber}`);
  const correctNode = document.getElementById(`teacherMcq${cardNumber}Correct`);
  if (questionNode) questionNode.value = String(questionData?.question || '').trim();
  if (questionImageNode) {
    questionImageNode.value = String(questionData?.imageUrl || '').trim();
    updateTeacherImagePreview(questionImageNode);
  }
  [1, 2, 3, 4].forEach((optionNumber) => {
    const option = normalizedOptions[optionNumber - 1] || { text: '', imageUrl: '' };
    const textNode = document.getElementById(`teacherMcq${cardNumber}Option${optionNumber}`);
    const imageNode = document.getElementById(`teacherMcq${cardNumber}Option${optionNumber}Image`);
    if (textNode) textNode.value = option.text;
    if (imageNode) {
      imageNode.value = option.imageUrl;
      updateTeacherImagePreview(imageNode);
    }
  });
  if (correctNode) correctNode.value = String(Math.max(0, Math.min(3, Number(questionData?.correctIndex || 0))));
}

function collectTeacherMcqQuestions() {
  const questionCount = Math.max(1, Math.min(20, Number(document.getElementById('teacherMcqCount')?.value || 2)));
  return Array.from({ length: questionCount }, (_, index) => {
    const question = (document.getElementById(`teacherMcqQuestion${index + 1}`)?.value || '').trim();
    const imageUrl = (document.getElementById(`teacherMcqQuestionImage${index + 1}`)?.value || '').trim();
    const options = [1, 2, 3, 4].map((optionIndex) => ({
      text: (document.getElementById(`teacherMcq${index + 1}Option${optionIndex}`)?.value || '').trim(),
      imageUrl: (document.getElementById(`teacherMcq${index + 1}Option${optionIndex}Image`)?.value || '').trim()
    }));
    const correctIndex = Number(document.getElementById(`teacherMcq${index + 1}Correct`)?.value || 0);
    return { question, imageUrl, options, correctIndex };
  });
}

function getTeacherMcqGenerationConfig() {
  const classScope = (document.getElementById('teacherMcqClass')?.value || 'all').trim();
  const subjectScope = (document.getElementById('teacherMcqSubject')?.value || 'all').trim();
  const boardScope = (document.getElementById('teacherMcqBoard')?.value || 'all').trim();
  const topic = (document.getElementById('teacherMcqTopic')?.value || '').trim();
  const difficulty = (document.getElementById('teacherMcqDifficulty')?.value || 'medium').trim();
  const questionCount = Math.max(1, Math.min(20, Number(document.getElementById('teacherMcqCount')?.value || 2)));
  return { classScope, subjectScope, boardScope, topic, difficulty, questionCount };
}

async function generateTeacherMcqsWithAi() {
  if (!hasActiveTeacherSession()) { alert('Please login as teacher first.'); return; }
  const title = (document.getElementById('teacherMcqTitle')?.value || '').trim() || 'Daily MCQ Batch';
  const config = getTeacherMcqGenerationConfig();
  if (!config.topic) {
    showTeacherMcqMessage('Please enter a topic before generating MCQs.', true);
    document.getElementById('teacherMcqTopic')?.focus();
    return;
  }
  showTeacherMcqMessage('Generating MCQs with AI...', false);
  try {
    const data = await API.generateTeacherMcqs({ title, ...config });
    const questions = Array.isArray(data.questions) ? data.questions : [];
    teacherMcqGenerationContext = { title, ...config };
    renderTeacherMcqCards(config.questionCount, questions);
    const modelName = data.modelUsed ? ` using ${data.modelUsed}` : '';
    showTeacherMcqMessage(`${questions.length} AI-generated question(s) are ready${modelName}. Review them and click Post MCQ Batch when satisfied.`, false);
  } catch (err) {
    showTeacherMcqMessage(err.message || 'Could not generate MCQs.', true);
  }
}

async function regenerateTeacherMcqQuestion(cardNumber) {
  if (!hasActiveTeacherSession()) { alert('Please login as teacher first.'); return; }
  const config = teacherMcqGenerationContext || getTeacherMcqGenerationConfig();
  if (!config.topic) {
    showTeacherMcqMessage('Please enter a topic and generate the batch first.', true);
    return;
  }
  const currentQuestions = collectTeacherMcqQuestions();
  showTeacherMcqMessage(`Regenerating question ${cardNumber}...`, false);
  try {
    const data = await API.regenerateTeacherMcq({
      ...config,
      questionIndex: cardNumber - 1,
      questions: currentQuestions
    });
    fillTeacherMcqCard(cardNumber, data.question || {});
    teacherMcqGenerationContext = { ...config };
    const modelName = data.modelUsed ? ` using ${data.modelUsed}` : '';
    showTeacherMcqMessage(`Question ${cardNumber} regenerated${modelName}.`, false);
  } catch (err) {
    showTeacherMcqMessage(err.message || 'Could not regenerate this question.', true);
  }
}

function isLikelyImageValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('data:image/')
    || normalized.includes('.png')
    || normalized.includes('.jpg')
    || normalized.includes('.jpeg')
    || normalized.includes('.gif')
    || normalized.includes('.webp')
    || normalized.includes('.svg');
}

function updateTeacherImagePreview(input) {
  const preview = document.getElementById(input?.dataset?.previewId || '');
  if (!preview) return;
  const value = String(input.value || '').trim();
  if (!value || !isLikelyImageValue(value)) {
    preview.style.display = 'none';
    preview.innerHTML = '';
    return;
  }
  preview.style.display = 'block';
  preview.innerHTML = `<img src="${value}" alt="Preview" style="max-width:180px;width:100%;border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:block;" />`;
}

function handleTeacherImagePaste(event, input) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find((item) => item.type && item.type.startsWith('image/'));
  if (!imageItem) return;
  const file = imageItem.getAsFile();
  if (!file) return;
  event.preventDefault();
  const reader = new FileReader();
  reader.onload = () => {
    input.value = String(reader.result || '');
    updateTeacherImagePreview(input);
  };
  reader.readAsDataURL(file);
}

function syncTeacherSubjectScope(selectId, rowId, subjectId) {
  const classNode = document.getElementById(selectId);
  const rowNode = document.getElementById(rowId);
  const subjectNode = document.getElementById(subjectId);
  if (!classNode || !rowNode || !subjectNode) return;
  const needsSubject = classNode.value === '11' || classNode.value === '12';
  rowNode.style.display = needsSubject ? '' : 'none';
  if (!needsSubject) subjectNode.value = 'all';
  else if (subjectNode.value === 'all') subjectNode.value = 'maths';
}

function showTeacherMcqMessage(message, isError) {
  const box = document.getElementById('teacherMcqMessage');
  if (!box) return;
  box.style.display = 'block';
  box.style.background = isError ? 'rgba(255,45,120,0.12)' : 'rgba(0,229,160,0.12)';
  box.style.borderColor = isError ? 'rgba(255,45,120,0.25)' : 'rgba(0,229,160,0.25)';
  box.textContent = message;
}

function showTeacherPanelMessage(id, message, isError) {
  const box = document.getElementById(id);
  if (!box) return;
  box.style.display = 'block';
  box.style.background = isError ? 'rgba(255,45,120,0.12)' : 'rgba(77,158,255,0.12)';
  box.style.borderColor = isError ? 'rgba(255,45,120,0.25)' : 'rgba(77,158,255,0.25)';
  box.textContent = message;
}

function renderTeacherMcqList(mcqs) {
  const body = document.getElementById('teacherMcqList');
  if (!body) return;
  if (!mcqs.length) {
    body.innerHTML = '<div style="color:var(--muted);font-size:0.9rem;">No daily MCQ batches posted yet.</div>';
    return;
  }
  body.innerHTML = mcqs.map((mcq, index) => {
    const total = Number(mcq.submission_count || 0);
    const correct = Number(mcq.correct_count || 0);
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const studentReports = Array.isArray(mcq.student_reports) ? mcq.student_reports : [];
    const attempted = studentReports.filter((s) => s.attemptedCount > 0);
    const notAttempted = studentReports.filter((s) => s.attemptedCount === 0);
    const attemptedHtml = attempted.length
      ? attempted.map((s) => {
        const studentAccuracy = s.attemptedCount ? Math.round(((s.correctCount || 0) / s.attemptedCount) * 100) : 0;
        return `<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 0;border-top:1px solid rgba(255,255,255,0.06);"><div><div style="font-weight:700;">${s.name}</div><div style="font-size:0.8rem;color:var(--muted);">Class ${s.class} - ${s.email || 'No email'}</div></div><div style="text-align:right;"><div style="font-weight:700;color:var(--green);">${s.score} (${studentAccuracy}%)</div><div style="font-size:0.8rem;color:var(--muted);">Correct ${s.correctCount || 0}, Wrong ${s.wrongCount}, Attempted ${s.attemptedCount}</div></div></div>`;
      }).join('')
      : '<div style="color:var(--muted);font-size:0.84rem;">No students have attempted this batch yet.</div>';
    const notAttemptedHtml = notAttempted.length
      ? `<div style="margin-top:12px;color:var(--muted);font-size:0.82rem;line-height:1.7;"><strong style="color:var(--yellow);">Not attempted:</strong> ${notAttempted.map((s) => `${s.name} (Class ${s.class})`).join(', ')}</div>`
      : '<div style="margin-top:12px;color:var(--green);font-size:0.82rem;">All assigned students have attempted this batch.</div>';
    return `
      <div style="padding:${index ? '16px 0 0' : '0'};margin-top:${index ? '16px' : '0'};border-top:${index ? '1px solid rgba(255,255,255,0.06)' : 'none'};">
        <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div style="font-size:0.78rem;color:var(--blue);font-weight:700;margin-bottom:6px;">${mcq.batch_title || mcq.title || 'Daily MCQ Batch'} - Class ${mcq.class_scope || 'all'}${mcq.board_scope && mcq.board_scope !== 'all' ? ' - ' + (mcq.board_scope === 'cbse' ? 'CBSE' : 'State Board') : ''}${mcq.subject_scope && mcq.subject_scope !== 'all' ? ' - ' + (mcq.subject_scope === 'business-maths' ? 'Business Maths' : 'Maths') : ''}</div>
            <div style="font-weight:700;line-height:1.5;">${mcq.question_count || 0} questions - student access ends ${mcq.available_until || 'in 24 hours'}</div>
          </div>
          <div style="min-width:220px;text-align:right;">
            <div style="font-weight:700;color:var(--green);">${accuracy}% accuracy</div>
            <div style="color:var(--muted);font-size:0.82rem;margin-top:4px;">Attempted: ${mcq.attempted_students || 0} | Not attempted: ${mcq.not_attempted_students || 0}</div>
            <div style="color:var(--muted);font-size:0.82rem;margin-top:4px;">Teacher results stay here for 2 days</div>
          </div>
        </div>
        <div style="margin-top:16px;padding:16px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
          <div style="font-size:0.76rem;color:var(--blue);font-weight:800;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Student Scores</div>
          ${attemptedHtml}${notAttemptedHtml}
        </div>
      </div>
    `;
  }).join('');
}

async function loadTeacherMcqs() {
  if (!hasActiveTeacherSession()) return;
  try {
    const data = await API.getTeacherMcqs();
    renderTeacherMcqList(data.mcqs || []);
  } catch (err) {
    showTeacherMcqMessage(err.message || 'Could not load daily MCQs.', true);
  }
}

async function createTeacherMcq() {
  if (!hasActiveTeacherSession()) { alert('Please login as teacher first.'); return; }
  const title = (document.getElementById('teacherMcqTitle')?.value || '').trim() || 'Daily MCQ Batch';
  const classScope = (document.getElementById('teacherMcqClass')?.value || 'all').trim();
  const subjectScope = (document.getElementById('teacherMcqSubject')?.value || 'all').trim();
  const boardScope = (document.getElementById('teacherMcqBoard')?.value || 'all').trim();
  const questionCount = Math.max(1, Math.min(20, Number(document.getElementById('teacherMcqCount')?.value || 2)));
  const questions = collectTeacherMcqQuestions().filter((item) => item.question || item.imageUrl || item.options.some((option) => option.text || option.imageUrl));
  if (!questions.length) { showTeacherMcqMessage('Add at least one MCQ card before posting.', true); return; }
  if (questions.some((item) => (!item.question && !item.imageUrl) || item.options.some((option) => !option.text && !option.imageUrl))) {
    showTeacherMcqMessage('Each filled MCQ card must have question text or image, plus 4 options with text or image.', true); return;
  }
  try {
    await API.createTeacherMcq({ title, classScope, subjectScope, boardScope, questions });
    const titleNode = document.getElementById('teacherMcqTitle');
    if (titleNode) titleNode.value = '';
    const topicNode = document.getElementById('teacherMcqTopic');
    if (topicNode) topicNode.value = '';
    const difficultyNode = document.getElementById('teacherMcqDifficulty');
    if (difficultyNode) difficultyNode.value = 'medium';
    teacherMcqGenerationContext = null;
    showTeacherMcqMessage(questions.length + ' question(s) posted successfully.', false);
    renderTeacherMcqCards(questionCount);
    await loadTeacherMcqs();
  } catch (err) {
    showTeacherMcqMessage(err.message || 'Could not post MCQ batch.', true);
  }
}

function renderTeacherPaperList(papers) {
  const wrap = document.getElementById('teacherPaperList');
  if (!wrap) return;
  if (!papers.length) { wrap.innerHTML = '<div style="color:var(--muted);font-size:0.9rem;">No question papers posted yet.</div>'; return; }
  wrap.innerHTML = papers.map((paper, index) => `
    <div style="padding:${index ? '16px 0 0' : '0'};margin-top:${index ? '16px' : '0'};border-top:${index ? '1px solid rgba(255,255,255,0.06)' : 'none'};display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <div style="font-weight:700;">${paper.title}</div>
        <div style="color:var(--muted);font-size:0.84rem;margin-top:4px;">Class ${paper.class_scope || 'all'}${paper.board_scope && paper.board_scope !== 'all' ? ' - ' + (paper.board_scope === 'cbse' ? 'CBSE' : 'State Board') : ''}${paper.subject_scope && paper.subject_scope !== 'all' ? ' - ' + (paper.subject_scope === 'business-maths' ? 'Business Maths' : 'Maths') : ''} - ${paper.resource_type || 'document'} - ${paper.posted_at || ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <a href="${paper.resource_url}" target="_blank" rel="noreferrer" style="color:var(--blue);font-weight:700;">Open ↗</a>
        <button class="btn-ghost" style="padding:10px 14px;" onclick="deleteTeacherQuestionPaper(${Number(paper.id) || 0})">Remove</button>
      </div>
    </div>
  `).join('');
}

async function loadTeacherQuestionPapers() {
  if (!hasActiveTeacherSession()) return;
  try {
    const data = await API.getTeacherQuestionPapers();
    renderTeacherPaperList(data.papers || []);
  } catch (err) {
    showTeacherPanelMessage('teacherPaperMessage', err.message || 'Could not load question papers.', true);
  }
}

async function createTeacherQuestionPaper() {
  const title = (document.getElementById('teacherPaperTitle')?.value || '').trim();
  const classScope = (document.getElementById('teacherPaperClass')?.value || 'all').trim();
  const subjectScope = (document.getElementById('teacherPaperSubject')?.value || 'all').trim();
  const boardScope = (document.getElementById('teacherPaperBoard')?.value || 'all').trim();
  const resourceType = (document.getElementById('teacherPaperType')?.value || 'pdf').trim();
  const resourceUrl = (document.getElementById('teacherPaperUrl')?.value || '').trim();
  if (!title || !resourceUrl) { showTeacherPanelMessage('teacherPaperMessage', 'Please enter a title and the document URL/path.', true); return; }
  try {
    await API.createTeacherQuestionPaper({ title, classScope, subjectScope, boardScope, resourceType, resourceUrl });
    ['teacherPaperTitle', 'teacherPaperUrl'].forEach((id) => { const node = document.getElementById(id); if (node) node.value = ''; });
    showTeacherPanelMessage('teacherPaperMessage', 'Question paper added successfully.', false);
    await loadTeacherQuestionPapers();
  } catch (err) {
    showTeacherPanelMessage('teacherPaperMessage', err.message || 'Could not add question paper.', true);
  }
}

async function deleteTeacherQuestionPaper(paperId) {
  if (!paperId) {
    showTeacherPanelMessage('teacherPaperMessage', 'Could not identify the question paper to remove.', true);
    return;
  }
  if (!window.confirm('Remove this question paper from teacher, student, and parent views?')) return;
  try {
    await API.deleteTeacherQuestionPaper(paperId);
    showTeacherPanelMessage('teacherPaperMessage', 'Question paper removed successfully.', false);
    await loadTeacherQuestionPapers();
    if (getCurrentRole() === 'student' || getCurrentRole() === 'parent') {
      await loadStudentResources();
    }
  } catch (err) {
    showTeacherPanelMessage('teacherPaperMessage', err.message || 'Could not remove question paper.', true);
  }
}

function renderTeacherWeeklyTestTable(students) {
  const body = document.getElementById('teacherWeeklyTestBody');
  if (!body) return;
  if (!students.length) { body.innerHTML = '<tr><td colspan="5" style="padding:18px;color:var(--muted);">No students available.</td></tr>'; return; }
  body.innerHTML = students.map((student) => `
    <tr data-student-id="${student.id}">
      <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">${student.name}</td>
      <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">Class ${student.class}</td>
      <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);"><input type="number" min="0" id="weekly-marks-${student.id}" placeholder="Marks" style="width:120px;" /></td>
      <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);"><input type="text" id="weekly-note-${student.id}" placeholder="Optional note" style="width:100%;" /></td>
      <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">${student.latestWeeklyTest ? `${student.latestWeeklyTest.title} - ${student.latestWeeklyTest.marks_obtained}/${student.latestWeeklyTest.total_marks}` : 'No entry yet'}</td>
    </tr>
  `).join('');
}

async function saveTeacherWeeklyTests() {
  const title = (document.getElementById('teacherWeeklyTestTitle')?.value || '').trim();
  const testDate = document.getElementById('teacherWeeklyTestDate')?.value || '';
  const totalMarks = Number(document.getElementById('teacherWeeklyTestTotal')?.value || 100);
  if (!title || !testDate) { showTeacherPanelMessage('teacherWeeklyTestMessage', 'Please enter the weekly test title and date.', true); return; }
  const entries = teacherStudentCache.map((student) => ({
    studentId: student.id,
    marksObtained: document.getElementById('weekly-marks-' + student.id)?.value || '',
    notes: document.getElementById('weekly-note-' + student.id)?.value || ''
  }));
  try {
    const result = await API.saveTeacherWeeklyTests({ title, testDate, totalMarks, entries });
    if (Array.isArray(result.students)) {
      teacherStudentCache = result.students;
      renderTeacherAttendanceTable(teacherStudentCache);
      renderTeacherWeeklyTestTable(teacherStudentCache);
      renderTeacherFeeTable(teacherStudentCache);
    }
    showTeacherPanelMessage('teacherWeeklyTestMessage', 'Weekly test marks saved successfully.', false);
    await loadTeacherAttendance();
  } catch (err) {
    showTeacherPanelMessage('teacherWeeklyTestMessage', err.message || 'Could not save weekly test marks.', true);
  }
}

function renderTeacherFeeTable(students) {
  const body = document.getElementById('teacherFeeBody');
  if (!body) return;
  if (!students.length) { body.innerHTML = '<tr><td colspan="6" style="padding:18px;color:var(--muted);">No students available.</td></tr>'; return; }
  body.innerHTML = students.map((student) => {
    const fee = student.feeSummary || {};
    const payments = Array.isArray(fee.payments) ? fee.payments.slice(0, 3) : [];
    const paymentHistory = payments.length
      ? payments.map((payment) => `
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);">
            <div style="font-size:0.82rem;color:var(--muted);">
              Rs ${Number(payment.amount_paid || 0)} on ${payment.paid_on || '-'}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn-outline-sm" type="button" onclick="editTeacherFeePayment(${Number(payment.id || 0)})">Edit</button>
              <button class="btn-outline-sm" type="button" onclick="deleteTeacherFeePayment(${Number(payment.id || 0)})">Delete</button>
            </div>
          </div>
        `).join('')
      : '<div style="font-size:0.82rem;color:var(--muted);">No saved fee entries yet.</div>';
    return `
      <tr data-student-id="${student.id}">
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">${student.name}</td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">Class ${student.class}</td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">Rs ${fee.totalDue || 0}</td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">Rs ${fee.totalPaid || 0}</td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);color:${Number(fee.pending || 0) > 0 ? 'var(--pink)' : 'var(--green)'};">Rs ${fee.pending || 0}</td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);"><input type="number" min="0" id="fee-paid-${student.id}" placeholder="Amount paid" style="width:140px;" /></td>
      </tr>
      <tr>
        <td colspan="6" style="padding:0 12px 14px 12px;border-top:0;">
          <div style="margin:0 0 4px 0;padding:12px 14px;border:1px solid rgba(255,255,255,0.06);border-radius:14px;background:rgba(255,255,255,0.02);">
            <div style="font-size:0.76rem;color:var(--blue);font-weight:800;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Recent Fee Entries</div>
            ${paymentHistory}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function findTeacherFeePayment(paymentId) {
  const safeId = Number(paymentId);
  for (const student of teacherStudentCache) {
    const payments = Array.isArray(student?.feeSummary?.payments) ? student.feeSummary.payments : [];
    const match = payments.find((payment) => Number(payment.id) === safeId);
    if (match) return { student, payment: match };
  }
  return null;
}

async function editTeacherFeePayment(paymentId) {
  const found = findTeacherFeePayment(paymentId);
  if (!found) {
    showTeacherPanelMessage('teacherFeeMessage', 'Could not find that fee payment.', true);
    return;
  }
  const currentAmount = Number(found.payment.amount_paid || 0);
  const currentDate = String(found.payment.paid_on || '').trim();
  const amountInput = window.prompt(`Edit amount for ${found.student.name}`, currentAmount ? String(currentAmount) : '');
  if (amountInput === null) return;
  const nextAmount = Number(amountInput);
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    showTeacherPanelMessage('teacherFeeMessage', 'Enter a valid payment amount greater than 0.', true);
    return;
  }
  const dateInput = window.prompt(`Edit payment date for ${found.student.name}`, currentDate);
  if (dateInput === null) return;
  const nextDate = String(dateInput || '').trim();
  if (!nextDate) {
    showTeacherPanelMessage('teacherFeeMessage', 'Payment date cannot be empty.', true);
    return;
  }
  try {
    const result = await API.updateTeacherFeePayment(paymentId, { amountPaid: nextAmount, paidOn: nextDate });
    if (Array.isArray(result.students)) {
      teacherStudentCache = result.students;
      renderTeacherAttendanceTable(teacherStudentCache);
      renderTeacherWeeklyTestTable(teacherStudentCache);
      renderTeacherFeeTable(teacherStudentCache);
    }
    showTeacherPanelMessage('teacherFeeMessage', 'Fee payment updated successfully.', false);
  } catch (err) {
    showTeacherPanelMessage('teacherFeeMessage', err.message || 'Could not update fee payment.', true);
  }
}

async function deleteTeacherFeePayment(paymentId) {
  const found = findTeacherFeePayment(paymentId);
  if (!found) {
    showTeacherPanelMessage('teacherFeeMessage', 'Could not find that fee payment.', true);
    return;
  }
  const confirmed = window.confirm(`Delete fee entry of Rs ${Number(found.payment.amount_paid || 0)} for ${found.student.name}?`);
  if (!confirmed) return;
  try {
    const result = await API.deleteTeacherFeePayment(paymentId);
    if (Array.isArray(result.students)) {
      teacherStudentCache = result.students;
      renderTeacherAttendanceTable(teacherStudentCache);
      renderTeacherWeeklyTestTable(teacherStudentCache);
      renderTeacherFeeTable(teacherStudentCache);
    }
    showTeacherPanelMessage('teacherFeeMessage', 'Fee payment deleted successfully.', false);
  } catch (err) {
    showTeacherPanelMessage('teacherFeeMessage', err.message || 'Could not delete fee payment.', true);
  }
}

async function saveTeacherFees() {
  const paidOn = document.getElementById('teacherFeeDate')?.value || '';
  if (!paidOn) { showTeacherPanelMessage('teacherFeeMessage', 'Please choose the payment date.', true); return; }
  const entries = teacherStudentCache.map((student) => ({
    studentId: student.id,
    amountPaid: document.getElementById('fee-paid-' + student.id)?.value || 0
  }));
  try {
    const result = await API.saveTeacherFees({ paidOn, entries });
    if (Array.isArray(result.students)) {
      teacherStudentCache = result.students;
      renderTeacherAttendanceTable(teacherStudentCache);
      renderTeacherWeeklyTestTable(teacherStudentCache);
      renderTeacherFeeTable(teacherStudentCache);
    }
    showTeacherPanelMessage('teacherFeeMessage', 'Fee payments saved successfully.', false);
    await loadTeacherAttendance();
  } catch (err) {
    showTeacherPanelMessage('teacherFeeMessage', err.message || 'Could not save fee payments.', true);
  }
}

function renderTeacherAttendanceTable(students) {
  const body = document.getElementById('teacherAttendanceBody');
  if (!body) return;
  if (!students.length) { body.innerHTML = '<tr><td colspan="6" style="padding:18px;color:var(--muted);">No students registered yet.</td></tr>'; return; }
  body.innerHTML = students.map((student) => {
    const attendance = student.attendance || {};
    const percentage = Number(attendance.percentage || 0);
    const currentStatus = student.currentStatus === 'absent' ? 'absent' : 'present';
    const approvalStatus = student.approvalStatus === 'rejected' ? 'rejected' : 'accepted';
    return `
      <tr data-student-id="${student.id}">
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">
          <div style="font-weight:700;">${student.name}</div>
          <div style="color:var(--muted);font-size:0.85rem;">${student.email || ''}</div>
        </td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">Class ${student.class}</td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">${student.mobile || 'Not available'}</td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">${percentage}% <span style="color:var(--muted);">(${attendance.present || 0}/${attendance.total || 0})</span></td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">
          <label style="margin-right:12px;cursor:pointer;"><input type="radio" name="attendance-${student.id}" value="present" ${currentStatus === 'present' ? 'checked' : ''}> Present</label>
          <label style="cursor:pointer;"><input type="radio" name="attendance-${student.id}" value="absent" ${currentStatus === 'absent' ? 'checked' : ''}> Absent</label>
        </td>
        <td style="padding:14px 12px;border-top:1px solid rgba(255,255,255,0.06);">
          <select id="approval-${student.id}" style="min-width:140px;">
            <option value="accepted" ${approvalStatus === 'accepted' ? 'selected' : ''}>Accept</option>
            <option value="rejected" ${approvalStatus === 'rejected' ? 'selected' : ''}>Reject</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

function showTeacherAttendanceMessage(message, isError) {
  const box = document.getElementById('teacherAttendanceMessage');
  if (!box) return;
  box.style.display = 'block';
  box.style.background = isError ? 'rgba(255,45,120,0.12)' : 'rgba(77,158,255,0.12)';
  box.style.borderColor = isError ? 'rgba(255,45,120,0.25)' : 'rgba(77,158,255,0.25)';
  box.textContent = message;
}

// ── DOUBTS ────────────────────────────────────────────────────────────────────
async function loadStudentDoubts() {
  if (!hasActiveStudentSession()) return;
  const wrap = document.getElementById('studentDoubtList');
  const popupStack = document.getElementById('doubtPopupStack');
  if (!wrap) return;
  try {
    const data = await API.getStudentDoubts();
    const doubts = data.doubts || [];
    if (!doubts.length) {
      wrap.innerHTML = '';
      if (popupStack) popupStack.innerHTML = '';
      return;
    }
    const answeredDoubts = doubts.filter((doubt) => doubt.status === 'answered' && (doubt.answer_text || doubt.answer_image));
    wrap.innerHTML = doubts.map((doubt, index) => {
      const status = doubt.status === 'answered' ? 'answered' : 'open';
      const answer = (doubt.answer_text || doubt.answer_image) ? `
        <div class="doubt-reply-block">
          <div class="doubt-reply-tag">Reply ${index + 1}</div>
          ${doubt.answer_text ? `<div class="doubt-reply-text">${doubt.answer_text}</div>` : ''}
          ${doubt.answer_image ? `<div class="doubt-answer"><img src="${doubt.answer_image}" alt="Answer" /></div>` : ''}
        </div>` : '';
      return `
        <div class="doubt-item">
          <div class="doubt-question-title">Question ${index + 1}: ${doubt.question_text}</div>
          ${doubt.question_image ? `<div class="doubt-answer"><img src="${doubt.question_image}" alt="Question" /></div>` : ''}
          <div class="doubt-meta">
            <span>Asked on ${doubt.created_at || 'Recently'}</span>
            <span class="doubt-status ${status}">${status}</span>
          </div>
          ${answer}
        </div>
      `;
    }).join('');
    if (popupStack) {
      popupStack.innerHTML = answeredDoubts.slice(0, 2).map((doubt, index) => `
        <div class="doubt-popup show">
          <div class="doubt-popup-label">${index + 1}</div>
          <div class="doubt-popup-text">${doubt.answer_text || 'Teacher sent an answer image.'}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    wrap.innerHTML = '';
    if (popupStack) popupStack.innerHTML = '';
  }
}

async function loadTeacherDoubts() {
  if (!hasActiveTeacherSession()) return;
  const wrap = document.getElementById('teacherDoubtList');
  if (!wrap) return;
  try {
    const data = await API.getTeacherDoubts();
    const doubts = data.doubts || [];
    if (!doubts.length) { wrap.innerHTML = '<div style="color:var(--muted);font-size:0.9rem;">No student doubts submitted yet.</div>'; return; }
    wrap.innerHTML = doubts.map((doubt) => {
      const isAnswered = doubt.status === 'answered';
      return `
        <div class="doubt-item teacher-doubt-card">
          <div class="teacher-doubt-head">
            <div class="teacher-doubt-student">${doubt.student_name || 'Student'} - Class ${doubt.student_class || '?'}</div>
            <span class="doubt-status ${isAnswered ? 'answered' : 'open'}">${isAnswered ? 'Answered' : 'Open'}</span>
          </div>
          <div class="doubt-question-title">${doubt.question_text}</div>
          ${doubt.question_image ? `<div class="doubt-answer"><img src="${doubt.question_image}" alt="Question image" /></div>` : ''}
          ${isAnswered ? `
            <div class="doubt-reply-block">
              <div class="doubt-reply-tag">Your Reply</div>
              ${doubt.answer_text ? `<div class="doubt-reply-text">${doubt.answer_text}</div>` : ''}
              ${doubt.answer_image ? `<div class="doubt-answer"><img src="${doubt.answer_image}" alt="Answer image" /></div>` : ''}
            </div>
          ` : `
            <div class="doubt-input" style="margin-top:12px;">
              <textarea id="doubt-answer-${doubt.id}" rows="3" placeholder="Type your reply here..."></textarea>
              <input type="text" id="doubt-answer-img-${doubt.id}" data-preview-id="doubt-answer-img-preview-${doubt.id}" placeholder="Paste image URL/path or press Ctrl+V to paste image" onpaste="handleTeacherImagePaste(event, this)" oninput="updateTeacherImagePreview(this)" />
              <div id="doubt-answer-img-preview-${doubt.id}" style="display:none;margin-top:10px;"></div>
              <button class="btn-secondary" onclick="answerTeacherDoubt(${doubt.id})">Send Reply</button>
            </div>
          `}
          <div class="doubt-meta"><span>${doubt.created_at || ''}</span></div>
        </div>
      `;
    }).join('');
  } catch (err) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:0.9rem;">${err.message || 'Could not load doubts.'}</div>`;
  }
}

async function answerTeacherDoubt(id) {
  const text = (document.getElementById('doubt-answer-' + id)?.value || '').trim();
  const image = (document.getElementById('doubt-answer-img-' + id)?.value || '').trim();
  if (!text) { alert('Please enter a reply.'); return; }
  try {
    await API.answerTeacherDoubt(id, text, image || null);
    await loadTeacherDoubts();
    await loadStudentDoubts();
  } catch (err) {
    alert(err.message || 'Could not send reply.');
  }
}

async function loadTeacherAttendance() {
  if (!hasActiveTeacherSession()) return;
  setDefaultTeacherDate();
  const attendanceDate = document.getElementById('teacherAttendanceDate')?.value || '';
  const weeklyDate = document.getElementById('teacherWeeklyTestDate');
  const feeDate = document.getElementById('teacherFeeDate');
  if (weeklyDate && !weeklyDate.value) weeklyDate.value = attendanceDate;
  if (feeDate && !feeDate.value) feeDate.value = attendanceDate;
  try {
    const data = await API.getTeacherStudents(attendanceDate);
    teacherStudentCache = data.students || [];
    renderTeacherAttendanceTable(teacherStudentCache);
    renderTeacherWeeklyTestTable(teacherStudentCache);
    renderTeacherFeeTable(teacherStudentCache);
    renderNavProfile();
    await loadTeacherQuestionPapers();
  } catch (err) {
    showTeacherAttendanceMessage(err.message || 'Could not load attendance.', true);
  }
}

async function saveTeacherAttendance() {
  if (!hasActiveTeacherSession()) { alert('Please login as teacher first.'); return; }
  const date = document.getElementById('teacherAttendanceDate')?.value;
  if (!date) { showTeacherAttendanceMessage('Please choose an attendance date.', true); return; }
  const rows = Array.from(document.querySelectorAll('#teacherAttendanceBody tr[data-student-id]')).map((row) => {
    const studentId = Number(row.dataset.studentId || 0);
    const selected = row.querySelector('input[type="radio"]:checked');
    const approval = row.querySelector('select');
    return studentId ? { studentId, status: selected ? selected.value : 'present', approvalStatus: approval ? approval.value : 'accepted' } : null;
  }).filter(Boolean);
  try {
    const result = await API.saveTeacherAttendance(date, rows);
    if (Array.isArray(result.students)) {
      teacherStudentCache = result.students;
      renderTeacherAttendanceTable(teacherStudentCache);
      renderTeacherWeeklyTestTable(teacherStudentCache);
      renderTeacherFeeTable(teacherStudentCache);
    }
    showTeacherAttendanceMessage('Attendance saved successfully for ' + date + '.', false);
    await refreshRoleData();
    await loadTeacherAttendance();
  } catch (err) {
    showTeacherAttendanceMessage(err.message || 'Could not save attendance.', true);
  }
}

// ── MCQ & PAPERS — STUDENT ────────────────────────────────────────────────────
async function submitDailyMcqAnswer(mcqId, optionIndex) {
  try {
    const result = await API.submitStudentDailyMcq(mcqId, optionIndex);
    alert(result.isCorrect ? 'Correct answer! ✓' : 'Answer saved.');
  } catch (err) {
    alert(err.message || 'Could not submit MCQ answer.');
  }
}

async function renderQuestionPapers(role) {
  const list = document.getElementById('studentPaperList');
  if (!list) return;
  try {
    const data = role === 'parent' ? await API.getParentQuestionPapers() : await API.getStudentQuestionPapers();
    const papers = data.papers || [];
    if (!papers.length) { list.innerHTML = '<div style="color:var(--muted);font-size:0.9rem;">No question papers posted yet.</div>'; return; }
    list.innerHTML = papers.map((paper) => `
      <div style="padding:14px;border:1px solid rgba(255,255,255,0.08);border-radius:14px;background:rgba(255,255,255,0.02);display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-weight:700;">${paper.title}</div>
          <div style="color:var(--muted);font-size:0.82rem;margin-top:4px;">Class ${paper.class_scope || 'all'} - ${paper.resource_type || 'document'} - ${paper.posted_at || ''}</div>
        </div>
        <a href="${paper.resource_url}" target="_blank" rel="noreferrer" style="color:var(--blue);font-weight:700;">Open ↗</a>
      </div>`
    ).join('');
  } catch (err) {
    list.innerHTML = '<div style="color:var(--muted);font-size:0.9rem;">Unable to load question papers.</div>';
  }
}

async function loadStudentResources() {
  const role = getCurrentRole();
  if (role !== 'student' && role !== 'parent') return;
  await renderDailyMcqs(role);
  await renderQuestionPapers(role);
}

async function renderDailyMcqs(role) {
  const summary = document.getElementById('studentMcqSummary');
  const list = document.getElementById('studentMcqList');
  if (!summary || !list) return;
  try {
    const data = role === 'parent' ? await API.getParentDailyMcqs() : await API.getStudentDailyMcqs();
    const mcqs = data.mcqs || [];
    summary.textContent = data.batchTitle
      ? `${data.batchTitle} - ${mcqs.length} question(s)${data.availableUntil ? ' - ends ' + data.availableUntil : ''}`
      : 'No active MCQ batch yet.';
    if (!mcqs.length) { list.innerHTML = '<div style="color:var(--muted);font-size:0.9rem;">No MCQs available right now.</div>'; return; }
    if (role === 'parent') {
      list.innerHTML = mcqs.map((mcq, idx) => `
        <div style="padding:14px;border:1px solid rgba(255,255,255,0.08);border-radius:14px;background:rgba(255,255,255,0.02);">
          <div style="font-weight:700;">${mcq.question || 'Question ' + (idx + 1)}</div>
          <div style="color:var(--muted);font-size:0.82rem;margin-top:6px;">Student can attempt this in their dashboard.</div>
        </div>`).join('');
      return;
    }
    list.innerHTML = mcqs.map((mcq, idx) => {
      const options = Array.isArray(mcq.options) ? mcq.options : [];
      const questionLabel = mcq.question ? mcq.question : 'Question ' + (idx + 1);
      const optionHtml = options.map((opt, optIndex) => {
        const option = typeof opt === 'string' ? { text: opt, imageUrl: '' } : { text: opt?.text || '', imageUrl: opt?.imageUrl || '' };
        return `
          <button class="btn-outline-sm" style="text-align:left;display:grid;gap:8px;" onclick="submitDailyMcqAnswer(${mcq.id}, ${optIndex})">
            ${option.text ? `<span>${String.fromCharCode(65 + optIndex)}. ${option.text}</span>` : `<span>${String.fromCharCode(65 + optIndex)}.</span>`}
            ${option.imageUrl ? `<img src="${option.imageUrl}" alt="Option ${optIndex + 1}" style="max-width:180px;width:100%;border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:block;" />` : ''}
          </button>`;
      }).join('');
      return `
        <div style="padding:14px;border:1px solid rgba(255,255,255,0.08);border-radius:14px;background:rgba(255,255,255,0.02);display:flex;flex-direction:column;gap:10px;">
          <div style="font-weight:700;">${questionLabel}</div>
          ${mcq.question_image ? `<img src="${mcq.question_image}" alt="Question ${idx + 1}" style="max-width:240px;width:100%;border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:block;" />` : ''}
          <div style="display:grid;gap:8px;">${optionHtml}</div>
        </div>`;
    }).join('');
  } catch (err) {
    summary.textContent = err.message || 'Unable to load MCQs.';
    list.innerHTML = '';
  }
}

// ── PAGE LOAD — FIXED teacher dashboard loading ───────────────────────────────
let dashboardBootstrapPromise = null;

async function bootstrapDashboard() {
  if (dashboardBootstrapPromise) return dashboardBootstrapPromise;

  dashboardBootstrapPromise = (async () => {
    renderTeacherMcqCards();

    const role = getCurrentRole();
    updateHomeForSession();

    if (role === 'teacher') {
      try {
        await Promise.all([
          loadTeacherAttendance(),
          loadTeacherMcqs(),
          loadTeacherDoubts()
        ]);
      } catch (e) {
        console.warn('Teacher data load error:', e.message);
      }
      updateDashboardAttendanceCards();
      renderNavProfile();
    } else if (role === 'student') {
      try { await refreshRoleData(); } catch (e) { console.warn('Student profile refresh failed:', e.message); }
      try { await loadStudentResources(); } catch (e) { console.warn('Student resources load failed:', e.message); }
      try { await loadStudentDoubts(); } catch (e) { console.warn('Student doubts load failed:', e.message); }
    } else if (role === 'parent') {
      try { await refreshParentDashboard(); } catch (e) { console.warn('Parent dashboard refresh failed:', e.message); }
      try { await loadStudentResources(); } catch (e) { console.warn('Parent resources load failed:', e.message); }
    }
  })();

  try {
    await dashboardBootstrapPromise;
  } finally {
    dashboardBootstrapPromise = null;
  }
}

window.addEventListener('load', () => {
  bootstrapDashboard().catch((e) => console.warn('Dashboard bootstrap failed:', e.message));
});

window.addEventListener('pageshow', () => {
  bootstrapDashboard().catch((e) => console.warn('Dashboard restore failed:', e.message));
});

window.addEventListener('hashchange', () => {
  if (window.location.hash === '#teacher-dashboard' && hasActiveTeacherSession()) {
    const teacherTab = document.getElementById('teacherDashTab');
    if (teacherTab) switchTab('teacher', teacherTab);
  }
});

























