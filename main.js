let teacherStudents = [];
let currentLoginType = 'student';
let currentTab = 'student';
let assessmentState = {
  step: 1,
  questions: [],
  answers: [],
  index: 0,
  studentDraft: null
};

const classQuestionBank = {
  '9': [
    { topic: 'Algebra', question: 'What is the value of x in 3x + 6 = 18?', options: ['2', '4', '6', '8'], answer: 1 },
    { topic: 'Geometry', question: 'How many degrees are there in a triangle?', options: ['90', '120', '180', '360'], answer: 2 },
    { topic: 'Mensuration', question: 'Area of a square with side 6 cm is?', options: ['12', '24', '36', '48'], answer: 2 },
    { topic: 'Statistics', question: 'The average of 4, 6, 8 is?', options: ['5', '6', '7', '8'], answer: 1 }
  ],
  '10': [
    { topic: 'Trigonometry', question: 'sin 90 degrees is?', options: ['0', '1/2', '1', '2'], answer: 2 },
    { topic: 'Algebra', question: 'The roots of x^2 - 5x + 6 are?', options: ['1, 6', '2, 3', '3, 5', '1, 5'], answer: 1 },
    { topic: 'Statistics', question: 'Mode means?', options: ['Average', 'Middle value', 'Most repeated value', 'Range'], answer: 2 },
    { topic: 'Coordinate Geometry', question: 'Distance between (0,0) and (3,4) is?', options: ['4', '5', '6', '7'], answer: 1 }
  ],
  '11': [
    { topic: 'Sets', question: 'If A has 3 elements and B has 2, then A x B has?', options: ['5', '6', '8', '9'], answer: 1 },
    { topic: 'Trigonometry', question: 'tan 45 degrees is?', options: ['0', '1', 'sqrt(2)', '2'], answer: 1 },
    { topic: 'Calculus', question: 'Derivative of x^2 is?', options: ['x', '2x', 'x^3', '2'], answer: 1 },
    { topic: 'Sequences', question: 'Next term in 2, 4, 8, 16 is?', options: ['18', '24', '30', '32'], answer: 3 }
  ],
  '12': [
    { topic: 'Calculus', question: 'Integral of 1 dx is?', options: ['0', '1', 'x + C', 'x^2 + C'], answer: 2 },
    { topic: 'Probability', question: 'Probability values always lie between?', options: ['0 and 1', '1 and 2', '-1 and 1', '0 and 100'], answer: 0 },
    { topic: 'Matrices', question: 'A 2 x 3 matrix has how many elements?', options: ['5', '6', '8', '9'], answer: 1 },
    { topic: 'Vectors', question: 'A vector has?', options: ['Only magnitude', 'Only direction', 'Magnitude and direction', 'Neither'], answer: 2 }
  ]
};

function $(id) {
  return document.getElementById(id);
}

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatUpdated() {
  return new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function currentRole() {
  if (localStorage.getItem('ilearn_teacher_token')) return 'teacher';
  if (localStorage.getItem('ilearn_student_token')) return 'student';
  return null;
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function setHtml(id, value) {
  const node = $(id);
  if (node) node.innerHTML = value;
}

function showMessage(id, message, tone = 'error') {
  const node = $(id);
  if (!node) return;
  node.textContent = message;
  node.style.display = message ? 'block' : 'none';
  node.style.background = tone === 'success' ? 'rgba(0,229,160,0.08)' : 'rgba(255,45,120,0.08)';
  node.style.border = tone === 'success'
    ? '1px solid rgba(0,229,160,0.25)'
    : '1px solid rgba(255,45,120,0.25)';
}

function openLoginModal() {
  $('loginModal')?.classList.add('open');
  showMessage('loginErrorMessage', '');
}

function closeLoginModal() {
  $('loginModal')?.classList.remove('open');
}

function openRegisterModal() {
  $('registerModal')?.classList.add('open');
  showRegisterStep(1);
}

function closeRegisterModal() {
  $('registerModal')?.classList.remove('open');
  resetAssessment();
}

function openDoubtModal() {
  showMessage('doubtSubmitMessage', 'Doubt box can be connected next once the core dashboard flow is stable.');
  $('doubtModal')?.classList.add('open');
}

function closeDoubtModal() {
  $('doubtModal')?.classList.remove('open');
}

function toggleMenu() {
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;
  navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
}

function toggleProfileMenu() {
  $('profilePanel')?.classList.toggle('open');
}

function closeProfileMenu() {
  $('profilePanel')?.classList.remove('open');
}

function setLoginType(type) {
  currentLoginType = type === 'teacher' ? 'teacher' : 'student';
  $('ltab-student')?.classList.toggle('active', currentLoginType === 'student');
  $('ltab-teacher')?.classList.toggle('active', currentLoginType === 'teacher');
  $('loginStudentFields').style.display = currentLoginType === 'student' ? 'block' : 'none';
  $('loginTeacherFields').style.display = currentLoginType === 'teacher' ? 'block' : 'none';
  showMessage('loginErrorMessage', '');
}

function showRegisterStep(step) {
  assessmentState.step = step;
  $('regStep1').style.display = step === 1 ? 'block' : 'none';
  $('regStep2').style.display = step === 2 ? 'block' : 'none';
  $('regStep3').style.display = step === 3 ? 'block' : 'none';
}

function resetAssessment() {
  assessmentState = {
    step: 1,
    questions: [],
    answers: [],
    index: 0,
    studentDraft: null
  };
}

function getSelectedClass() {
  return $('regClass')?.value || '';
}

function updateSubjectVisibility() {
  const studentClass = getSelectedClass();
  const row = $('regSubjectRow');
  if (!row) return;
  row.style.display = studentClass === '11' || studentClass === '12' ? 'grid' : 'none';
}

function buildAssessmentQuestions(studentClass) {
  const bank = classQuestionBank[studentClass] || classQuestionBank['10'];
  return bank.map((item) => ({ ...item }));
}

function renderQuestion() {
  const question = assessmentState.questions[assessmentState.index];
  if (!question) return;

  setText('testTitle', `Class ${assessmentState.studentDraft.class} Readiness Check`);
  setText('testSubtitle', 'Answer a short diagnostic so the dashboard feels like your older flow again.');
  setText('qProgress', `Question ${assessmentState.index + 1} of ${assessmentState.questions.length}`);
  const percent = Math.round(((assessmentState.index + 1) / assessmentState.questions.length) * 100);
  setText('qPct', `${percent}%`);
  $('qProgFill').style.width = `${percent}%`;
  $('prevBtn').style.display = assessmentState.index > 0 ? 'inline-block' : 'none';
  $('nextBtn').textContent = assessmentState.index === assessmentState.questions.length - 1 ? 'Finish Test' : 'Next ->';

  const selected = assessmentState.answers[assessmentState.index];
  setHtml('questionArea', `
    <div class="dash-widget" style="background:var(--dark3);padding:22px;">
      <div style="font-size:0.78rem;color:var(--blue);font-weight:800;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">${question.topic}</div>
      <h3 style="font-family:'Syne',sans-serif;font-size:1.2rem;margin-bottom:18px;">${question.question}</h3>
      <div style="display:grid;gap:12px;">
        ${question.options.map((option, index) => `
          <label style="display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:16px;border:1px solid ${selected === index ? 'rgba(255,45,120,0.45)' : 'rgba(255,255,255,0.08)'};background:${selected === index ? 'rgba(255,45,120,0.08)' : 'rgba(255,255,255,0.03)'};cursor:pointer;">
            <input type="radio" name="assessmentOption" value="${index}" ${selected === index ? 'checked' : ''} onchange="selectAnswer(${index})" style="margin-top:3px;">
            <span>${option}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `);
}

function selectAnswer(index) {
  assessmentState.answers[assessmentState.index] = index;
}

function prevQ() {
  if (assessmentState.index > 0) {
    assessmentState.index -= 1;
    renderQuestion();
  }
}

function nextQ() {
  if (typeof assessmentState.answers[assessmentState.index] !== 'number') {
    alert('Please choose an answer before moving on.');
    return;
  }

  if (assessmentState.index < assessmentState.questions.length - 1) {
    assessmentState.index += 1;
    renderQuestion();
    return;
  }

  showAssessmentResult();
}

function buildTopicBreakdown() {
  const summary = {};
  assessmentState.questions.forEach((question, index) => {
    const key = question.topic;
    if (!summary[key]) summary[key] = { correct: 0, total: 0 };
    summary[key].total += 1;
    if (assessmentState.answers[index] === question.answer) summary[key].correct += 1;
  });
  return summary;
}

function showAssessmentResult() {
  const total = assessmentState.questions.length;
  const correct = assessmentState.questions.reduce((sum, question, index) => (
    sum + (assessmentState.answers[index] === question.answer ? 1 : 0)
  ), 0);
  const percent = Math.round((correct / total) * 100);
  const grade = percent >= 85 ? 'Excellent start' : percent >= 65 ? 'Strong potential' : 'Needs guided support';
  const note = percent >= 85
    ? 'You are ready for advanced practice and faster weekly targets.'
    : percent >= 65
      ? 'A few targeted improvements can quickly lift your score.'
      : 'This is a good place to begin. We can build stronger basics from here.';

  setText('resultScore', `${percent}%`);
  setText('resultGrade', grade);
  setText('resultNote', note);

  const topicSummary = buildTopicBreakdown();
  const strong = [];
  const weak = [];
  Object.entries(topicSummary).forEach(([topic, stats]) => {
    const topicPercent = Math.round((stats.correct / stats.total) * 100);
    if (topicPercent >= 70) strong.push(topic);
    else weak.push(topic);
  });

  setHtml('resultGrid', `
    <div class="rbox good">
      <div class="rbox-title good">Strong Areas</div>
      ${(strong.length ? strong : ['Building momentum']).map((item) => `<div class="rbox-item">${item}</div>`).join('')}
    </div>
    <div class="rbox weak">
      <div class="rbox-title weak">Focus Next</div>
      ${(weak.length ? weak : ['Revise mixed problems']).map((item) => `<div class="rbox-item">${item}</div>`).join('')}
    </div>
  `);

  setHtml('topicBars', Object.entries(topicSummary).map(([topic, stats]) => {
    const topicPercent = Math.round((stats.correct / stats.total) * 100);
    return `
      <div class="t-bar-wrap">
        <div class="t-bar-top"><span>${topic}</span><span>${topicPercent}%</span></div>
        <div class="t-bar"><div class="t-bar-fill" style="width:${topicPercent}%;background:linear-gradient(90deg,var(--pink),var(--purple));"></div></div>
      </div>
    `;
  }).join(''));
  setHtml('aiTip', `<strong>Suggested next move:</strong> Start with ${weak[0] || 'mixed revision'} this week, then reinforce ${strong[0] || 'core algebra'} through timed practice.`);

  showRegisterStep(3);
}

async function startAssessment() {
  const studentClass = getSelectedClass();
  const payload = {
    name: $('regName')?.value.trim() || '',
    class: studentClass,
    subject: $('regSubject')?.value || 'maths',
    mobile: $('regMobile')?.value.trim() || '',
    email: $('regEmail')?.value.trim() || '',
    password: $('regPassword')?.value || ''
  };

  if (!payload.name || !payload.class || !payload.mobile || !payload.email || !payload.password) {
    alert('Please complete all registration fields first.');
    return;
  }

  try {
    await API.registerStudent(payload);
    assessmentState.studentDraft = payload;
    assessmentState.questions = buildAssessmentQuestions(studentClass);
    assessmentState.answers = Array(assessmentState.questions.length).fill(null);
    assessmentState.index = 0;
    showRegisterStep(2);
    renderQuestion();
  } catch (error) {
    alert(error.message || 'Could not create the student account.');
  }
}

async function loginStudentWithPassword() {
  try {
    await API.loginStudent(($('ls-email')?.value || '').trim(), $('ls-password')?.value || '');
    closeLoginModal();
    await loadStudentDashboard();
  } catch (error) {
    showMessage('loginErrorMessage', error.message || 'Could not login student.');
  }
}

async function loginTeacher() {
  try {
    await API.loginTeacher(($('lt-email')?.value || '').trim(), $('lt-password')?.value || '');
    closeLoginModal();
    await loadTeacherDashboard();
  } catch (error) {
    showMessage('loginErrorMessage', error.message || 'Could not login teacher.');
  }
}

function updateRoleVisibility(role) {
  document.querySelectorAll('.role-student-only').forEach((node) => {
    node.style.display = role === 'teacher' ? 'none' : '';
  });
  document.querySelectorAll('.role-teacher-only').forEach((node) => {
    node.style.display = role === 'teacher' ? '' : 'none';
  });

  const loginBtn = $('navLoginBtn');
  const registerBtn = $('navRegisterBtn');
  const profileMenu = $('profileMenu');
  if (role) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';
    if (profileMenu) profileMenu.style.display = 'block';
  } else {
    if (loginBtn) loginBtn.style.display = '';
    if (registerBtn) registerBtn.style.display = '';
    if (profileMenu) profileMenu.style.display = 'none';
  }
}

function buildProfilePanel(profile) {
  const role = currentRole();
  if (!profile) return;
  setHtml('profilePanel', `
    <h4>${profile.name || 'I LEARN User'}</h4>
    <p>${role === 'teacher' ? 'Teacher access to attendance, fee, and weekly test workflows.' : 'Student access to your live dashboard and reports.'}</p>
    <div class="profile-row">
      <div class="profile-label">Role</div>
      <div class="profile-value">${role === 'teacher' ? 'Teacher' : 'Student'}</div>
    </div>
    <div class="profile-row">
      <div class="profile-label">${role === 'teacher' ? 'Email' : 'Class'}</div>
      <div class="profile-value">${role === 'teacher' ? (profile.email || '-') : `Class ${profile.class || '--'}`}</div>
    </div>
    <div class="profile-row">
      <div class="profile-label">${role === 'teacher' ? 'Access' : 'Email'}</div>
      <div class="profile-value">${role === 'teacher' ? 'Dashboard Controls' : (profile.email || '-')}</div>
    </div>
    <button class="profile-logout" onclick="logoutCurrentUser()">Logout</button>
  `);
}

function switchTab(tab, button) {
  currentTab = tab === 'teacher' ? 'teacher' : 'student';
  document.querySelectorAll('.dash-tab').forEach((node) => node.classList.remove('active'));
  if (button) button.classList.add('active');
  $('tab-student')?.classList.toggle('active', currentTab === 'student');
  $('tab-teacher')?.classList.toggle('active', currentTab === 'teacher');
}

function renderStudentTopics(profile) {
  const weeklyTests = Array.isArray(profile.weeklyTests) ? profile.weeklyTests : [];
  if (!weeklyTests.length) {
    setHtml('parentTopicProgress', '<div style="color:var(--muted);font-size:0.88rem;">Topic-wise progress will appear after a few weekly tests are entered.</div>');
    setHtml('parentStrongTopics', '<span style="color:#8888AA;font-size:0.88rem;">Build weekly test history first.</span>');
    setHtml('parentWeakTopics', '<span style="color:#8888AA;font-size:0.88rem;">Weak areas will show here automatically.</span>');
    return;
  }

  const average = Math.round(weeklyTests.reduce((sum, item) => {
    const total = Number(item.total_marks || 0);
    const marks = Number(item.marks_obtained || 0);
    return sum + (total ? (marks / total) * 100 : 0);
  }, 0) / weeklyTests.length);

  const attendancePercent = Number(profile.attendanceSummary?.overall?.percentage || 0);
  const strongTopics = [];
  const weakTopics = [];

  if (average >= 75) strongTopics.push('Weekly test accuracy');
  else weakTopics.push('Timed weekly test practice');
  if (attendancePercent >= 85) strongTopics.push('Consistency and attendance');
  else weakTopics.push('Attendance follow-up');
  if ((profile.feeSummary?.pending || 0) === 0) strongTopics.push('Fee status is clear');
  else weakTopics.push('Fee follow-up pending');

  setHtml('parentTopicProgress', `
    <div class="progress-bar-wrap">
      <div class="progress-label"><span>Average Weekly Test Score</span><span>${average}%</span></div>
      <div class="progress-bar"><div class="progress-fill purple" style="width:${average}%"></div></div>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-label"><span>Attendance Consistency</span><span>${attendancePercent}%</span></div>
      <div class="progress-bar"><div class="progress-fill blue" style="width:${attendancePercent}%"></div></div>
    </div>
  `);
  setHtml('parentStrongTopics', strongTopics.map((item) => `<div class="alert-pill blue"><div class="alert-title blue">${item}</div><div class="alert-desc">Doing well in this area.</div></div>`).join(''));
  setHtml('parentWeakTopics', weakTopics.map((item) => `<div class="alert-pill pink"><div class="alert-title pink">${item}</div><div class="alert-desc">Keep focusing here this week.</div></div>`).join(''));
}

function renderStudentWeeklyTests(profile) {
  const weeklyTests = Array.isArray(profile.weeklyTests) ? profile.weeklyTests : [];
  setHtml('parentWeeklyTests', weeklyTests.length
    ? weeklyTests.slice(0, 5).map((test) => `
        <div class="metric-row">
          <div>
            <div class="metric-value">${test.title}</div>
            <div class="metric-label">${test.test_date || ''}${test.notes ? ` - ${test.notes}` : ''}</div>
          </div>
          <span class="metric-value">${Number(test.marks_obtained || 0)}/${Number(test.total_marks || 0)}</span>
        </div>
      `).join('')
    : '<div style="color:var(--muted);font-size:0.88rem;">Weekly test marks will appear here once teachers enter them.</div>');
}

function renderStudentTimetable() {
  setHtml('studentTodayTimetable', `
    <div class="tt-slot">
      <div class="tt-dot" style="background:var(--blue)"></div>
      <div class="tt-time">Focus</div>
      <div>Revise one weak topic and solve 5 mixed problems today.</div>
    </div>
    <div class="tt-slot">
      <div class="tt-dot" style="background:var(--green)"></div>
      <div class="tt-time">Test</div>
      <div>Review the latest weekly test corrections before the next class.</div>
    </div>
  `);
}

function calculateStreak(profile) {
  const streak = Number(profile.attendanceStreak || 0);
  if (streak >= 2) return `${streak} days`;
  if (streak === 1) return '1 day';
  return '0 days';
}

async function loadStudentDashboard() {
  updateRoleVisibility('student');
  switchTab('student', $('studentDashTab'));
  document.getElementById('dashboards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const profile = await API.getStudentProfile();
    localStorage.setItem('ilearn_student_profile', JSON.stringify(profile));

    setText('dashboardWelcomeName', profile.student?.name || 'Learner');
    setText('dashboardWelcomeRole', 'Signed in as student');
    setText('dashboardWelcomeUpdated', `Last updated: ${formatUpdated()}`);
    setText('studentAttendanceMonth', `${profile.attendanceSummary?.month?.present || 0} / ${profile.attendanceSummary?.month?.total || 0} days`);
    setText('studentAttendanceOverall', `${profile.attendanceSummary?.overall?.percentage || 0}%`);
    setText('studentAttendanceProgressLabel', `${profile.attendanceSummary?.overall?.percentage || 0}%`);
    $('studentAttendanceProgress').style.width = `${Math.max(0, Math.min(100, Number(profile.attendanceSummary?.overall?.percentage || 0)))}%`;
    setText('studentAttendanceHint', profile.attendanceSummary?.overall?.total
      ? `Overall attendance: ${profile.attendanceSummary.overall.present}/${profile.attendanceSummary.overall.total} classes marked.`
      : 'Login to see your live attendance summary.');
    setText('studentAttendanceUpdated', `Last updated: ${formatUpdated()}`);

    setText('studentStreakValue', calculateStreak(profile));
    setText('studentStreakUpdated', `Last updated: ${formatUpdated()}`);

    const fee = profile.feeSummary || {};
    setText('parentFeeBatch', profile.student?.class ? `Class ${profile.student.class}` : 'Class --');
    setText('parentFeeStatus', fee.totalDue ? (fee.pending > 0 ? `Rs ${fee.pending} pending` : 'Paid up') : 'No entries yet');
    setText('parentFeePaid', `Rs ${fee.totalPaid || 0}`);
    setText('parentFeePending', `Rs ${fee.pending || 0}`);
    const lastPayment = Array.isArray(fee.payments) && fee.payments.length ? fee.payments[0] : null;
    setHtml('parentFeeLastPaid', `<span class="metric-label">Last Paid</span><span class="metric-value">${lastPayment ? `${lastPayment.paid_on} - Rs ${lastPayment.amount_paid}` : '-'}</span>`);
    setText('parentFeeUpdated', `Last updated: ${formatUpdated()}`);

    renderStudentWeeklyTests(profile);
    setText('parentWeeklyTestsUpdated', `Last updated: ${formatUpdated()}`);
    renderStudentTopics(profile);
    renderStudentTimetable();
    setHtml('studentDoubtList', '<div style="color:var(--muted);font-size:0.9rem;">Doubt reply history can be connected next on top of this PostgreSQL flow.</div>');

    buildProfilePanel(profile.student);
  } catch (error) {
    setText('dashboardWelcomeName', 'Learner');
    setText('dashboardWelcomeRole', 'Student session needs attention');
    setText('dashboardWelcomeUpdated', `Last updated: ${formatUpdated()}`);
    setText('studentAttendanceHint', error.message || 'Could not load the student dashboard.');
    showMessage('loginErrorMessage', error.message || 'Could not load student dashboard.');
  }
}

function renderTeacherAttendanceTable() {
  if (!teacherStudents.length) {
    setHtml('teacherAttendanceBody', '<tr><td colspan="6" style="padding:18px;color:var(--muted);">No students registered yet.</td></tr>');
    return;
  }

  setHtml('teacherAttendanceBody', teacherStudents.map((student) => `
    <tr>
      <td style="padding:14px 12px;">
        <div style="font-weight:700;">${student.name}</div>
        <div style="font-size:0.82rem;color:var(--muted);">${student.email}</div>
      </td>
      <td style="padding:14px 12px;">Class ${student.class}</td>
      <td style="padding:14px 12px;">${student.mobile || '-'}</td>
      <td style="padding:14px 12px;">${student.attendance?.percentage || 0}% (${student.attendance?.present || 0}/${student.attendance?.total || 0})</td>
      <td style="padding:14px 12px;">
        <label style="margin-right:14px;"><input type="radio" name="attendance-${student.id}" value="present" ${(student.currentStatus || 'present') === 'present' ? 'checked' : ''}> Present</label>
        <label><input type="radio" name="attendance-${student.id}" value="absent" ${student.currentStatus === 'absent' ? 'checked' : ''}> Absent</label>
      </td>
      <td style="padding:14px 12px;">Live DB</td>
    </tr>
  `).join(''));
}

function renderTeacherWeeklyTestTable() {
  if (!teacherStudents.length) {
    setHtml('teacherWeeklyTestBody', '<tr><td colspan="5" style="padding:18px;color:var(--muted);">No students available.</td></tr>');
    return;
  }

  setHtml('teacherWeeklyTestBody', teacherStudents.map((student) => `
    <tr>
      <td style="padding:14px 12px;">${student.name}</td>
      <td style="padding:14px 12px;">Class ${student.class}</td>
      <td style="padding:14px 12px;"><input type="number" min="0" id="weeklyMarks-${student.id}" placeholder="Marks" style="width:100%;background:var(--dark3);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:10px 12px;color:var(--text);"></td>
      <td style="padding:14px 12px;"><input type="text" id="weeklyNotes-${student.id}" placeholder="Optional note" style="width:100%;background:var(--dark3);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:10px 12px;color:var(--text);"></td>
      <td style="padding:14px 12px;">${student.latestWeeklyTest ? `${student.latestWeeklyTest.title} - ${student.latestWeeklyTest.marks_obtained}/${student.latestWeeklyTest.total_marks}` : 'No entry yet'}</td>
    </tr>
  `).join(''));
}

function renderTeacherFeeTable() {
  if (!teacherStudents.length) {
    setHtml('teacherFeeBody', '<tr><td colspan="6" style="padding:18px;color:var(--muted);">No students available.</td></tr>');
    return;
  }

  setHtml('teacherFeeBody', teacherStudents.map((student) => `
    <tr>
      <td style="padding:14px 12px;">${student.name}</td>
      <td style="padding:14px 12px;">Class ${student.class}</td>
      <td style="padding:14px 12px;">Rs ${student.feeSummary?.totalDue || 0}</td>
      <td style="padding:14px 12px;">Rs ${student.feeSummary?.totalPaid || 0}</td>
      <td style="padding:14px 12px;">Rs ${student.feeSummary?.pending || 0}</td>
      <td style="padding:14px 12px;"><input type="number" min="0" id="feeAmount-${student.id}" placeholder="Amount paid" style="width:100%;background:var(--dark3);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:10px 12px;color:var(--text);"></td>
    </tr>
  `).join(''));
}

async function loadTeacherAttendance() {
  await loadTeacherDashboard();
}

async function loadTeacherDashboard() {
  updateRoleVisibility('teacher');
  switchTab('teacher', $('teacherDashTab'));
  document.getElementById('dashboards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const attendanceDate = $('teacherAttendanceDate');
  const weeklyDate = $('teacherWeeklyTestDate');
  const feeDate = $('teacherFeeDate');
  if (attendanceDate && !attendanceDate.value) attendanceDate.value = todayIsoDate();
  if (weeklyDate && !weeklyDate.value) weeklyDate.value = todayIsoDate();
  if (feeDate && !feeDate.value) feeDate.value = todayIsoDate();

  try {
    const data = await API.getTeacherStudents(attendanceDate?.value || '');
    teacherStudents = Array.isArray(data.students) ? data.students : [];
    setText('dashboardWelcomeName', data.teacher?.name || 'Teacher');
    setText('dashboardWelcomeRole', 'Signed in as teacher');
    setText('dashboardWelcomeUpdated', `Last updated: ${formatUpdated()}`);
    renderTeacherAttendanceTable();
    renderTeacherWeeklyTestTable();
    renderTeacherFeeTable();
    buildProfilePanel(data.teacher);
    showMessage('teacherAttendanceMessage', '');
    showMessage('teacherWeeklyTestMessage', '');
    showMessage('teacherFeeMessage', '');
  } catch (error) {
    setText('dashboardWelcomeName', 'Teacher');
    setText('dashboardWelcomeRole', 'Could not load teacher dashboard');
    setText('dashboardWelcomeUpdated', `Last updated: ${formatUpdated()}`);
    showMessage('teacherAttendanceMessage', error.message || 'Could not load teacher dashboard.');
  }
}

async function saveTeacherAttendance() {
  const date = $('teacherAttendanceDate')?.value || '';
  if (!date) {
    showMessage('teacherAttendanceMessage', 'Please choose an attendance date.');
    return;
  }

  const attendance = teacherStudents.map((student) => ({
    studentId: student.id,
    status: document.querySelector(`input[name="attendance-${student.id}"]:checked`)?.value || 'present'
  }));

  try {
    const data = await API.saveTeacherAttendance({ date, attendance });
    teacherStudents = Array.isArray(data.students) ? data.students : teacherStudents;
    renderTeacherAttendanceTable();
    renderTeacherWeeklyTestTable();
    renderTeacherFeeTable();
    showMessage('teacherAttendanceMessage', `Attendance saved successfully for ${date}.`, 'success');
  } catch (error) {
    showMessage('teacherAttendanceMessage', error.message || 'Could not save attendance.');
  }
}

async function saveTeacherWeeklyTests() {
  const title = $('teacherWeeklyTestTitle')?.value.trim() || '';
  const testDate = $('teacherWeeklyTestDate')?.value || '';
  const totalMarks = Number($('teacherWeeklyTestTotal')?.value || 100);

  if (!title || !testDate) {
    showMessage('teacherWeeklyTestMessage', 'Please enter the weekly test title and date.');
    return;
  }

  const entries = teacherStudents.map((student) => ({
    studentId: student.id,
    marksObtained: $(`weeklyMarks-${student.id}`)?.value || '',
    notes: $(`weeklyNotes-${student.id}`)?.value || ''
  }));

  try {
    const data = await API.saveTeacherWeeklyTests({ title, testDate, totalMarks, entries });
    teacherStudents = Array.isArray(data.students) ? data.students : teacherStudents;
    renderTeacherAttendanceTable();
    renderTeacherWeeklyTestTable();
    renderTeacherFeeTable();
    showMessage('teacherWeeklyTestMessage', `Weekly test marks saved for ${title}.`, 'success');
  } catch (error) {
    showMessage('teacherWeeklyTestMessage', error.message || 'Could not save weekly tests.');
  }
}

async function saveTeacherFees() {
  const paidOn = $('teacherFeeDate')?.value || '';
  if (!paidOn) {
    showMessage('teacherFeeMessage', 'Please choose a fee payment date.');
    return;
  }

  const entries = teacherStudents.map((student) => ({
    studentId: student.id,
    amountPaid: $(`feeAmount-${student.id}`)?.value || 0
  }));

  try {
    const data = await API.saveTeacherFees({ paidOn, entries });
    teacherStudents = Array.isArray(data.students) ? data.students : teacherStudents;
    renderTeacherAttendanceTable();
    renderTeacherWeeklyTestTable();
    renderTeacherFeeTable();
    showMessage('teacherFeeMessage', `Fee entries saved for ${paidOn}.`, 'success');
  } catch (error) {
    showMessage('teacherFeeMessage', error.message || 'Could not save fees.');
  }
}

function logoutCurrentUser() {
  closeProfileMenu();
  if (currentRole() === 'teacher') {
    API.logoutTeacher();
    return;
  }
  API.logoutStudent();
}

function runRevealAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.animate-in').forEach((node) => observer.observe(node));
}

async function boot() {
  runRevealAnimations();
  updateSubjectVisibility();
  $('regClass')?.addEventListener('change', updateSubjectVisibility);
  document.addEventListener('click', (event) => {
    const profileMenu = $('profileMenu');
    if (profileMenu && !profileMenu.contains(event.target)) closeProfileMenu();
  });

  const role = currentRole();
  if (role === 'teacher') {
    await loadTeacherDashboard();
  } else if (role === 'student') {
    await loadStudentDashboard();
  } else {
    updateRoleVisibility(null);
    switchTab('student', $('studentDashTab'));
  }
}

window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
window.openRegisterModal = openRegisterModal;
window.closeRegisterModal = closeRegisterModal;
window.openDoubtModal = openDoubtModal;
window.closeDoubtModal = closeDoubtModal;
window.toggleMenu = toggleMenu;
window.toggleProfileMenu = toggleProfileMenu;
window.setLoginType = setLoginType;
window.loginStudentWithPassword = loginStudentWithPassword;
window.loginTeacher = loginTeacher;
window.startAssessment = startAssessment;
window.prevQ = prevQ;
window.nextQ = nextQ;
window.selectAnswer = selectAnswer;
window.switchTab = switchTab;
window.loadTeacherAttendance = loadTeacherAttendance;
window.saveTeacherAttendance = saveTeacherAttendance;
window.saveTeacherWeeklyTests = saveTeacherWeeklyTests;
window.saveTeacherFees = saveTeacherFees;
window.logoutCurrentUser = logoutCurrentUser;

window.addEventListener('load', boot);




























