function formatAttendanceLabel(present, total) {
  const safePresent = Number(present) || 0;
  const safeTotal = Number(total) || 0;
  const percentage = safeTotal ? Math.round((safePresent / safeTotal) * 100) : 0;
  return `${safePresent}/${safeTotal} (${percentage}%)`;
}

function dashboardProfileMarkup(title, subtitle, details, logoutLabel, logoutFn) {
  const items = details.map((item) => `
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px 16px;min-width:160px;">
      <div style="font-size:0.72rem;color:#8888AA;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">${item.label}</div>
      <div style="font-size:0.95rem;font-weight:600;color:#E8E8F5;">${item.value}</div>
    </div>
  `).join('');

  return `
    <section id="roleDashboardProfile" style="max-width:1100px;margin:22px auto 0;padding:0 24px;">
      <div style="background:linear-gradient(135deg,rgba(77,158,255,0.12),rgba(255,45,120,0.12));border:1px solid rgba(255,255,255,0.1);border-radius:22px;padding:22px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <div style="font-size:0.76rem;color:#4D9EFF;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">${title}</div>
          <h2 style="font-family:'Syne',sans-serif;font-size:1.45rem;font-weight:800;margin-bottom:6px;">${subtitle}</h2>
          <p style="color:#B6B6D6;font-size:0.92rem;line-height:1.6;">Your dashboard is ready.</p>
        </div>
        <button onclick="${logoutFn}()" style="background:#FF2D78;color:#fff;border:none;border-radius:999px;padding:11px 18px;font-weight:700;cursor:pointer;">${logoutLabel}</button>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px;">${items}</div>
    </section>
  `;
}

async function refreshStudentLearningHub() {
  const hub = document.getElementById('studentLearningHub');
  if (!hub) return;
  const data = await API.getStudentProfile();
  hub.outerHTML = studentHubMarkup(data);
}

async function submitStudentProfileMcq(mcqId) {
  const selected = document.querySelector(`input[name="profile-mcq-${mcqId}"]:checked`);
  if (!selected) {
    alert('Please select an option before submitting.');
    return;
  }
  try {
    await API.submitStudentDailyMcq(mcqId, Number(selected.value));
    await refreshStudentLearningHub();
  } catch (error) {
    alert(error.message || 'Could not submit MCQ.');
  }
}

function studentHubMarkup(data) {
  const dailyMcqSet = data.dailyMcqSet || { questions: [] };
  const questionPapers = data.questionPapers || [];
  const weeklyTests = data.weeklyTests || [];
  const feeSummary = data.feeSummary || null;

  const mcqSection = dailyMcqSet.questions.length
    ? `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:22px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div style="font-size:0.78rem;color:#4D9EFF;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Daily MCQ</div>
            <h3 style="font-family:'Syne',sans-serif;margin-top:6px;">${dailyMcqSet.batchTitle || 'Current 24-hour MCQ batch'}</h3>
            <p style="color:#B6B6D6;font-size:0.88rem;margin-top:6px;">Complete before ${dailyMcqSet.availableUntil || 'the expiry time'}.</p>
          </div>
          <div style="padding:10px 16px;border-radius:999px;background:#4D9EFF;color:#fff;font-weight:700;">MCQ Section</div>
        </div>
        <div style="margin-top:16px;display:grid;gap:14px;">
          ${dailyMcqSet.questions.map((mcq) => {
            const answered = mcq.selected_index !== null && mcq.selected_index !== undefined;
            const status = answered ? (mcq.is_correct ? 'Completed correctly' : 'Completed - needs review') : 'Pending';
            const statusColor = answered ? (mcq.is_correct ? '#00E5A0' : '#FF2D78') : '#FFD166';
            const options = Array.isArray(mcq.options) ? mcq.options : [];
            return `
              <div style="padding:16px;border-radius:16px;background:rgba(13,13,26,0.55);border:1px solid rgba(255,255,255,0.06);display:grid;gap:14px;">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
                  <div>
                    <div style="font-size:0.78rem;color:#4D9EFF;font-weight:700;">Question ${mcq.question_no}</div>
                    ${mcq.question ? `<div style="margin-top:6px;font-size:0.92rem;line-height:1.6;">${mcq.question}</div>` : ''}
                    ${mcq.question_image ? `<img src="${mcq.question_image}" alt="MCQ question ${mcq.question_no}" style="margin-top:10px;max-width:280px;width:100%;border-radius:14px;border:1px solid rgba(255,255,255,0.08);display:block;" />` : ''}
                  </div>
                  <div style="color:${statusColor};font-weight:700;font-size:0.84rem;">${status}</div>
                </div>
                <div style="display:grid;gap:10px;">
                  ${options.map((option, optionIndex) => {
                    const optionText = typeof option === 'string' ? option : (option?.text || '');
                    const optionImage = typeof option === 'string' ? '' : (option?.imageUrl || '');
                    return `
                    <label style="display:flex;gap:10px;align-items:flex-start;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);padding:10px 12px;border-radius:12px;cursor:${answered ? 'default' : 'pointer'};">
                      <input type="radio" name="profile-mcq-${mcq.id}" value="${optionIndex}" ${Number(mcq.selected_index) === optionIndex ? 'checked' : ''} ${answered ? 'disabled' : ''} />
                      <span style="display:grid;gap:8px;font-size:0.88rem;color:#E8E8F5;line-height:1.5;">${optionText ? `<span>${optionText}</span>` : ''}${optionImage ? `<img src="${optionImage}" alt="Option ${optionIndex + 1}" style="max-width:180px;width:100%;border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:block;" />` : ''}</span>
                    </label>
                  `; }).join('')}
                </div>
                ${answered
                  ? `<div style="color:#B6B6D6;font-size:0.82rem;">Submitted on ${mcq.submitted_at || 'today'}.</div>`
                  : `<button onclick="submitStudentProfileMcq(${mcq.id})" style="background:#00E5A0;color:#081019;border:none;border-radius:999px;padding:10px 16px;font-weight:800;cursor:pointer;justify-self:flex-start;">Submit Answer</button>`}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `
    : `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:22px;">
        <div style="font-size:0.78rem;color:#4D9EFF;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Daily MCQ</div>
        <h3 style="font-family:'Syne',sans-serif;margin-top:6px;">No active MCQ batch right now</h3>
        <p style="color:#B6B6D6;font-size:0.88rem;margin-top:8px;">Your teacher's 24-hour batch will appear here.</p>
      </div>
    `;

  const papersSection = `
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:22px;">
      <div style="font-size:0.78rem;color:#4D9EFF;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Weekly Question Papers</div>
      <h3 style="font-family:'Syne',sans-serif;margin-top:6px;">Teacher-posted question papers</h3>
      <div style="margin-top:14px;display:grid;gap:12px;">
        ${questionPapers.length ? questionPapers.map((paper) => `
          <a href="${paper.resource_url}" target="_blank" rel="noreferrer" style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-radius:16px;background:rgba(13,13,26,0.55);border:1px solid rgba(255,255,255,0.06);color:#E8E8F5;text-decoration:none;">
            <span>${paper.title}</span>
            <span style="color:#B6B6D6;font-size:0.84rem;">${paper.resource_type || 'document'} · ${paper.posted_at || ''}</span>
          </a>
        `).join('') : '<div style="color:#B6B6D6;font-size:0.88rem;">No question papers posted yet.</div>'}
      </div>
    </div>
  `;

  const testsSection = `
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:22px;">
      <div style="font-size:0.78rem;color:#4D9EFF;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Weekly Tests</div>
      <h3 style="font-family:'Syne',sans-serif;margin-top:6px;">Latest test entries from your teacher</h3>
      <div style="margin-top:14px;display:grid;gap:12px;">
        ${weeklyTests.length ? weeklyTests.slice(0, 5).map((test) => `
          <div style="padding:14px 16px;border-radius:16px;background:rgba(13,13,26,0.55);border:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;">${test.title}</div>
              <div style="color:#B6B6D6;font-size:0.84rem;margin-top:4px;">${test.test_date || ''}</div>
            </div>
            <div style="font-weight:700;color:#00E5A0;">${test.marks_obtained}/${test.total_marks}</div>
          </div>
        `).join('') : '<div style="color:#B6B6D6;font-size:0.88rem;">No weekly test marks entered yet.</div>'}
      </div>
    </div>
  `;

  const feesSection = `
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:22px;">
      <div style="font-size:0.78rem;color:#4D9EFF;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Fees</div>
      <h3 style="font-family:'Syne',sans-serif;margin-top:6px;">Current fee summary</h3>
      ${feeSummary ? `
        <div style="margin-top:14px;display:grid;gap:12px;">
          <div style="padding:14px 16px;border-radius:16px;background:rgba(13,13,26,0.55);border:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;"><span>Total Fee</span><strong>Rs ${feeSummary.totalDue || 0}</strong></div>
          <div style="padding:14px 16px;border-radius:16px;background:rgba(13,13,26,0.55);border:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;"><span>Paid</span><strong>Rs ${feeSummary.totalPaid || 0}</strong></div>
          <div style="padding:14px 16px;border-radius:16px;background:rgba(13,13,26,0.55);border:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;"><span>Pending</span><strong style="color:${feeSummary.pending > 0 ? '#FF2D78' : '#00E5A0'}">Rs ${feeSummary.pending || 0}</strong></div>
          ${(feeSummary.payments || []).slice(0, 3).map(p => `
            <div style="padding:10px 16px;border-radius:12px;background:rgba(0,229,160,0.06);border:1px solid rgba(0,229,160,0.15);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:0.84rem;">
              <span style="color:#B6B6D6;">Paid on ${p.paid_on}</span>
              <strong style="color:#00E5A0;">Rs ${p.amount_paid}</strong>
            </div>
          `).join('')}
        </div>
      ` : '<div style="margin-top:14px;color:#B6B6D6;font-size:0.88rem;">Fee summary will appear here once entries are added.</div>'}
    </div>
  `;

  return `
    <section id="studentLearningHub" style="max-width:1100px;margin:20px auto 0;padding:0 24px;">
      <div style="display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));">${mcqSection}${papersSection}${testsSection}${feesSection}</div>
    </section>
  `;
}

async function setupStudentDashboard() {
  if (!localStorage.getItem('ilearn_token')) return;
  try {
    const data = await API.getStudentProfile();
    const student = data.student;
    const expected = 'class' + String(student.class).trim() + '.html';
    if (!window.location.pathname.endsWith(expected)) {
      window.location.href = expected;
      return;
    }
    const topbar = document.querySelector('.topbar');
    if (topbar && !document.getElementById('roleDashboardProfile')) {
      topbar.insertAdjacentHTML('afterend', dashboardProfileMarkup(
        'Student Profile',
        student.name,
        [
          { label: 'Role', value: 'Student' },
          { label: 'Class', value: 'Class ' + student.class },
          { label: 'Email', value: student.email || 'Not available' },
          { label: 'Mobile', value: student.mobile || 'Not available' },
          { label: 'Attendance', value: formatAttendanceLabel(data.attendance?.present, data.totalAttendance?.total) }
        ],
        'Logout',
        'API.logoutStudent'
      ));
    }
    if (topbar && !document.getElementById('studentLearningHub')) {
      const profileNode = document.getElementById('roleDashboardProfile');
      if (profileNode) {
        profileNode.insertAdjacentHTML('afterend', studentHubMarkup(data));
      }
    }
  } catch (err) {
    API.logoutStudent();
  }
}

// ── PARENT DASHBOARD (ai-parentreport.html) ─────────────────────────────────

async function setupParentDashboard() {
  if (!localStorage.getItem('ilearn_parent_token')) {
    window.location.href = 'index.html';
    return;
  }
  try {
    const data = await API.getParentReport();
    const student = data.student;
    const report = data.report || data || {};

    let aiData;
    try {
      aiData = await API.getParentAIReport();
    } catch (e) {
      aiData = buildFallbackAiReport(student, report);
    }
    if (!aiData || (!aiData.overallSummary && !aiData.aiReport)) {
      aiData = buildFallbackAiReport(student, report);
    }
    if (aiData.aiReport) aiData = aiData.aiReport;

    const topbar = document.querySelector('.topbar');
    if (topbar && student && !document.getElementById('roleDashboardProfile')) {
      const monthAtt = report.attendanceSummary?.month || report.attendance || {};
      topbar.insertAdjacentHTML('afterend', dashboardProfileMarkup(
        'Parent Profile',
        'Parent of ' + student.name,
        [
          { label: 'Role', value: 'Parent' },
          { label: 'Student', value: student.name },
          { label: 'Class', value: 'Class ' + student.class },
          { label: 'Email', value: student.email || 'Not available' },
          { label: 'Subject', value: student.subject || 'Maths' },
          { label: 'Board', value: student.board || 'Not available' },
          { label: 'Mobile', value: student.mobile || 'Not available' },
          { label: 'Attendance', value: formatAttendanceLabel(monthAtt.present, monthAtt.total) }
        ],
        'Logout',
        'API.logoutParent'
      ));
    }

    if (typeof renderReport === 'function' && student) {
      const assessments = report.assessmentHistory || [];
      const latest = report.latestAssessment || assessments[0] || null;
      const previous = assessments[1] || null;
      const previousTopics = previous?.topic_scores ? JSON.parse(previous.topic_scores || '{}') : {};
      const topicScores = latest?.topic_scores ? JSON.parse(latest.topic_scores || '{}') : report.topicScores || {};
      const topicEntries = Object.entries(topicScores);
      const monthAtt = report.attendanceSummary?.month || report.attendance || {};

      const demo = {
        attendance: Number(monthAtt.present) || 0,
        totalDays: Number(monthAtt.total) || 24,
        testsCompleted: assessments.length,
        testsTotal: Math.max(assessments.length, 1),
        avgScore: latest?.total ? Math.round((latest.score / latest.total) * 100) : 0,
        prevScore: previous?.total ? Math.round((previous.score / previous.total) * 100) : 0,
        rank: 1,
        batchSize: 1,
        weeklySummary: report.weeklySummary || null,
        weakTopics: report.weakTopics || (latest?.weak_topics ? JSON.parse(latest.weak_topics || '[]') : []),
        strongTopics: report.strongTopics || (latest?.strong_topics ? JSON.parse(latest.strong_topics || '[]') : []),
        recentMcqs: report.recentMcqs || [],
        weeklyTests: report.weeklyTests || [],
        questionPapers: report.questionPapers || [],
        feeSummary: report.feeSummary || null,
        topics: topicEntries.map(([name, score]) => ({
          name,
          score: Number(score) || 0,
          prev: Number(previousTopics[name]) || Number(score) || 0
        }))
      };

      renderReport(student.name, 'Class ' + student.class, 'Latest Update', demo, aiData);
    }
  } catch (err) {
    console.error('Parent dashboard error:', err);
    const main = document.getElementById('mainContent');
    if (main) {
      main.innerHTML = `
        <h1>Parent Dashboard</h1>
        <p style="color:var(--muted);margin-top:12px;">Could not load report: ${err.message || 'Unknown error'}.</p>
        <button class="btn-primary" style="margin-top:20px;" onclick="API.logoutParent()">Logout</button>
      `;
    }
  }
}

function buildFallbackAiReport(student, report) {
  const name = student?.name || 'Student';
  const weakTopics = report.weakTopics || [];
  const strongTopics = report.strongTopics || [];
  const latestScore = report.latestTotal ? Math.round((report.latestScore / report.latestTotal) * 100) : 0;
  const monthAtt = report.attendanceSummary?.month || report.attendance || {};
  return {
    overallSummary: `${name} is progressing steadily. Latest assessment score: ${latestScore}%. Attendance this month: ${monthAtt.present || 0}/${monthAtt.total || 0} days.`,
    highlights: [
      strongTopics.length ? 'Strong topics: ' + strongTopics.join(', ') : 'Keep encouraging regular practice.',
      'Attendance is being tracked and updated by the teacher.'
    ],
    concerns: weakTopics.length ? ['Needs extra attention in: ' + weakTopics.join(', ') + '.'] : ['No major weak topics identified yet.'],
    parentTips: [
      'Ask your child to revise one weak topic for 20–30 minutes daily.',
      'Review attendance and weekly test performance together each week.'
    ],
    nextWeekFocus: weakTopics.length ? `Focus on ${weakTopics[0]} and keep practicing recent test topics.` : 'Maintain consistency with revision and daily practice.'
  };
}

// ── INDEX.HTML PARENT TAB — live data injection ──────────────────────────────

function ensureParentExtraWidgets() {
  const parentTab = document.getElementById('tab-parent');
  if (!parentTab) return;

  if (!document.getElementById('parentWeeklyTests')) {
    const weekly = document.createElement('div');
    weekly.className = 'dash-widget';
    weekly.id = 'parentWeeklyTestsWidget';
    weekly.innerHTML = `
      <h4>📋 Weekly Test Marks</h4>
      <div id="parentWeeklyTests" style="color:var(--muted);font-size:0.9rem;">Weekly test marks will appear here once teachers enter them.</div>
      <div class="dash-updated" id="parentWeeklyTestsUpdated">Last updated: --</div>
    `;
    parentTab.appendChild(weekly);
  }

  if (!document.getElementById('parentMcqList')) {
    const mcq = document.createElement('div');
    mcq.className = 'dash-widget';
    mcq.id = 'parentMcqWidget';
    mcq.innerHTML = `
      <h4>📝 Daily MCQ Performance</h4>
      <div id="parentMcqSummary" style="color:var(--muted);font-size:0.9rem;margin-bottom:12px;">Daily MCQ summary will appear here.</div>
      <div id="parentMcqList"></div>
      <div class="dash-updated" id="parentMcqUpdated">Last updated: --</div>
    `;
    parentTab.appendChild(mcq);
  }

  if (!document.getElementById('parentTopicProgress')) {
    const topics = document.createElement('div');
    topics.className = 'dash-widget';
    topics.id = 'parentTopicWidget';
    topics.innerHTML = `
      <h4>📈 Topic Performance</h4>
      <div id="parentTopicProgress" style="color:var(--muted);font-size:0.9rem;">Topic performance will appear here after an assessment.</div>
    `;
    parentTab.appendChild(topics);
  }

  if (!document.getElementById('parentQuestionPapers')) {
    const papers = document.createElement('div');
    papers.className = 'dash-widget';
    papers.id = 'parentPapersWidget';
    papers.innerHTML = `
      <h4>📄 Question Papers</h4>
      <div id="parentQuestionPapers" style="color:var(--muted);font-size:0.9rem;">No question papers posted yet.</div>
    `;
    parentTab.appendChild(papers);
  }

  if (!document.getElementById('parentWeakTopics') && !document.getElementById('parentStrongTopics')) {
    const topicTags = document.createElement('div');
    topicTags.className = 'dash-widget';
    topicTags.id = 'parentTopicsWidget';
    topicTags.innerHTML = `
      <h4>🎯 Weak & Strong Topics</h4>
      <div style="margin-bottom:12px;">
        <div style="font-size:0.78rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;">Needs Focus</div>
        <div id="parentWeakTopics" style="color:var(--muted);font-size:0.88rem;">No data yet.</div>
      </div>
      <div>
        <div style="font-size:0.78rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;">Strong Areas</div>
        <div id="parentStrongTopics" style="color:var(--muted);font-size:0.88rem;">No data yet.</div>
      </div>
    `;
    parentTab.appendChild(topicTags);
  }
}

// ── CORE FIX: injectParentTabData now accepts the raw API response directly ──
function injectParentTabData(report, student) {
  // Ensure all widget DOM nodes exist before writing to them
  ensureParentExtraWidgets();

  // Normalise the report — the API returns flat + nested simultaneously
  // /api/parent/report returns { student, report: {...}, ...flatFields }
  const normalizedReport = report.report || report;

  const monthAtt   = normalizedReport.attendanceSummary?.month
    || normalizedReport.attendance
    || {};
  const overallAtt = normalizedReport.attendanceSummary?.overall || monthAtt;
  const feeSummary = normalizedReport.feeSummary || null;
  const weeklyTests   = normalizedReport.weeklyTests   || [];
  const dailyMcqSet   = normalizedReport.dailyMcqSet   || {};
  const mcqQuestions  = Array.isArray(dailyMcqSet.questions) ? dailyMcqSet.questions : [];
  const recentMcqs    = Array.isArray(normalizedReport.recentMcqs) ? normalizedReport.recentMcqs : [];
  const questionPapers= normalizedReport.questionPapers || [];
  const weakTopics    = normalizedReport.weakTopics    || [];
  const strongTopics  = normalizedReport.strongTopics  || [];
  const latestAssessment = normalizedReport.latestAssessment || null;
  const now = new Date();

  // ── Attendance ──────────────────────────────────────────────────────────────
  setElementText('parentAttendanceMonth',          `${monthAtt.present || 0} / ${monthAtt.total || 0} days`);
  setElementText('parentAttendanceOverall',        `${overallAtt.percentage || 0}%`);
  setElementText('parentAttendanceStudent',        student?.name || 'Linked student');
  setElementText('parentAttendanceProgressLabel',  `${overallAtt.percentage || 0}%`);
  setElementWidth('parentAttendanceProgress',      `${Math.max(0, Math.min(100, Number(overallAtt.percentage || 0)))}%`);
  setUpdatedLabel('parentAttendanceUpdated', now);

  // ── Fee summary ─────────────────────────────────────────────────────────────
  setElementText('parentFeeBatch',   student?.class ? `Class ${student.class}` : 'Linked batch');
  const pendingAmt = Number(feeSummary?.pending || 0);
  setElementText('parentFeeStatus',  feeSummary ? (pendingAmt > 0 ? `Rs ${pendingAmt} pending` : 'Paid up') : 'No fee entries yet');
  setElementText('parentFeePaid',    `Rs ${feeSummary?.totalPaid || 0}`);
  setElementText('parentFeePending', `Rs ${feeSummary?.pending  || 0}`);
  setUpdatedLabel('parentFeeUpdated', now);

  // ── Weekly tests ────────────────────────────────────────────────────────────
  const weeklyWrap = document.getElementById('parentWeeklyTests');
  if (weeklyWrap) {
    if (!weeklyTests.length) {
      weeklyWrap.innerHTML = '<span style="color:var(--muted);font-size:0.88rem;">Weekly test marks will appear here once teachers enter them.</span>';
    } else {
      weeklyWrap.innerHTML = weeklyTests.slice(0, 5).map(test => `
        <div class="metric-row" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <span class="metric-label">${test.title || 'Test'} (${test.test_date || ''})</span>
          <span class="metric-value">${Number(test.marks_obtained || 0)}/${Number(test.total_marks || 100)}</span>
        </div>
      `).join('');
    }
    setUpdatedLabel('parentWeeklyTestsUpdated', now);
  }

  // ── MCQ performance ─────────────────────────────────────────────────────────
  const answered = recentMcqs.filter(q => q.selected_index !== null && q.selected_index !== undefined);
  const correct  = answered.filter(q => q.is_correct === 1 || q.is_correct === true).length;

  const mcqSummaryEl = document.getElementById('parentMcqSummary');
  if (mcqSummaryEl) {
    if (recentMcqs.length) {
      mcqSummaryEl.textContent = `${correct}/${recentMcqs.length} recent MCQs correct`;
    } else if (dailyMcqSet.batchTitle) {
      mcqSummaryEl.textContent = `${dailyMcqSet.batchTitle} — waiting for student attempt`;
    } else {
      mcqSummaryEl.textContent = 'No recent MCQ submissions yet.';
    }
  }

  const mcqListEl = document.getElementById('parentMcqList');
  if (mcqListEl) {
    // Show recent submissions first; fall back to current batch questions
    const sourceItems = recentMcqs.length ? recentMcqs : mcqQuestions;
    if (!sourceItems.length) {
      mcqListEl.innerHTML = '<span style="color:var(--muted);font-size:0.88rem;">No MCQ activity yet.</span>';
    } else {
      mcqListEl.innerHTML = sourceItems.slice(0, 6).map((item, idx) => {
        const attempted  = item.selected_index !== null && item.selected_index !== undefined;
        const isCorrect  = item.is_correct === 1 || item.is_correct === true;
        const statusText = attempted ? (isCorrect ? '✓ Answered correctly' : '✗ Needs review') : 'Not attempted yet';
        const statusCol  = attempted ? (isCorrect ? 'var(--green)' : 'var(--yellow)') : 'var(--muted)';
        return `
          <div style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.06);">
            <div style="font-weight:700;font-size:0.88rem;">Q${item.question_no || idx + 1}: ${item.question || item.title || 'Question'}</div>
            <div style="font-size:0.82rem;margin-top:6px;color:${statusCol};">${statusText}</div>
          </div>
        `;
      }).join('');
    }
    setUpdatedLabel('parentMcqUpdated', now);
  }

  // ── Topic performance ───────────────────────────────────────────────────────
  const topicScores = latestAssessment?.topic_scores
    ? JSON.parse(latestAssessment.topic_scores || '{}')
    : (normalizedReport.topicScores || {});

  const topicWrap = document.getElementById('parentTopicProgress');
  if (topicWrap) {
    const entries = Object.entries(topicScores);
    if (entries.length) {
      topicWrap.innerHTML = entries.slice(0, 5).map(([topic, score]) => {
        const pct = Number(score) || 0;
        const col = pct >= 75 ? '#00E5A0' : pct >= 50 ? '#FFD166' : '#FF2D78';
        return `
          <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;">
              <span>${topic}</span><span style="color:${col};font-weight:700;">${pct}%</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:50px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${col};border-radius:50px;"></div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      topicWrap.innerHTML = '<span style="color:var(--muted);font-size:0.88rem;">Topic data will appear after the first assessment.</span>';
    }
  }

  // ── Question papers ─────────────────────────────────────────────────────────
  const paperWrap = document.getElementById('parentQuestionPapers');
  if (paperWrap) {
    if (!questionPapers.length) {
      paperWrap.innerHTML = '<span style="color:var(--muted);font-size:0.88rem;">No question papers posted yet.</span>';
    } else {
      paperWrap.innerHTML = questionPapers.slice(0, 5).map(paper => `
        <a href="${paper.resource_url}" target="_blank" rel="noreferrer"
           style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#E8E8F5;text-decoration:none;">
          <span style="font-size:0.88rem;">${paper.title}</span>
          <span style="color:#4D9EFF;font-size:0.82rem;">Open ↗</span>
        </a>
      `).join('');
    }
  }

  // ── Weak / strong topics ────────────────────────────────────────────────────
  const weakWrap = document.getElementById('parentWeakTopics');
  if (weakWrap) {
    weakWrap.innerHTML = weakTopics.length
      ? weakTopics.map(t => `<span style="display:inline-block;margin:3px;padding:4px 12px;border-radius:50px;background:rgba(255,45,120,0.12);color:#FF2D78;font-size:0.78rem;font-weight:700;">${t}</span>`).join('')
      : '<span style="color:var(--muted);font-size:0.88rem;">No weak topics identified yet.</span>';
  }

  const strongWrap = document.getElementById('parentStrongTopics');
  if (strongWrap) {
    strongWrap.innerHTML = strongTopics.length
      ? strongTopics.map(t => `<span style="display:inline-block;margin:3px;padding:4px 12px;border-radius:50px;background:rgba(0,229,160,0.12);color:#00E5A0;font-size:0.78rem;font-weight:700;">${t}</span>`).join('')
      : '<span style="color:var(--muted);font-size:0.88rem;">No strong topics identified yet.</span>';
  }
}

window.addEventListener('load', () => {
  const path = window.location.pathname;
  if (/class(9|10|11|12)\.html$/.test(path)) {
    setupStudentDashboard();
  } else if (path.endsWith('ai-parentreport.html')) {
    setupParentDashboard();
  }
});



