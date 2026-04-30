// ============================================================
//  I LEARN ACADEMY — Backend Server (server.js)
//  FIRST LINE MUST BE dotenv — loads your .env file
// ============================================================
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const path         = require('path');
const rateLimit    = require('express-rate-limit');
const { db, USING_POSTGRES } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_TEACHER_EMAIL = 'ilearntution@gmail.com';
function getCurrentMonthPrefix() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || String(new Date().getFullYear());
  const month = parts.find((part) => part.type === 'month')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
function buildAttendanceSummary(studentId, monthPrefix = '') {
  const pattern = monthPrefix ? monthPrefix + '%' : '%';
  const present = db.prepare("SELECT COUNT(*) AS count FROM attendance WHERE student_id=? AND date LIKE ? AND status='present'").get(studentId, pattern).count;
  const total   = db.prepare('SELECT COUNT(*) AS count FROM attendance WHERE student_id=? AND date LIKE ?').get(studentId, pattern).count;
  const safePresent = Number(present) || 0;
  const safeTotal   = Number(total)   || 0;
  return { present: safePresent, total: safeTotal, percentage: safeTotal ? Math.round((safePresent / safeTotal) * 1000) / 10 : 0 };
}
function buildWeeklyStudentSummary(studentId) {
  const attendance = db.prepare(`
    SELECT SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present, COUNT(*) AS total
    FROM attendance
    WHERE student_id=? AND CAST(date AS DATE) >= (CURRENT_DATE - INTERVAL '6 days')
  `).get(studentId);
  const timetable = db.prepare(`
    SELECT SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) AS completed, COUNT(*) AS total
    FROM timetable_completions
    WHERE student_id=? AND DATE(updated_at) >= (CURRENT_DATE - INTERVAL '6 days')
  `).get(studentId);
  const mcq = db.prepare(`
    SELECT SUM(CASE WHEN s.is_correct=1 THEN 1 ELSE 0 END) AS correct,
           COUNT(s.id) AS attempted
    FROM daily_mcq_submissions s
    WHERE s.student_id=? AND s.submitted_at >= (CURRENT_TIMESTAMP - INTERVAL '6 days')
  `).get(studentId);
  const present      = Number(attendance?.present)  || 0;
  const totalA       = Number(attendance?.total)    || 0;
  const completed    = Number(timetable?.completed) || 0;
  const totalT       = Number(timetable?.total)     || 0;
  const correct      = Number(mcq?.correct)         || 0;
  const attempted    = Number(mcq?.attempted)       || 0;
  return {
    attendance: { present, total: totalA,    percentage: totalA    ? Math.round((present   / totalA)    * 1000) / 10 : 0 },
    timetable:  { completed, total: totalT,  percentage: totalT    ? Math.round((completed / totalT)    * 1000) / 10 : 0 },
    mcq:        { correct, attempted, percentage: attempted ? Math.round((correct / attempted) * 1000) / 10 : 0 }
  };
}
function buildTimetableCompletionMap(timetableId, studentId) {
  const rows = db.prepare('SELECT slot_day, slot_time, topic, completed FROM timetable_completions WHERE timetable_id=? AND student_id=?').all(timetableId, studentId);
  return rows.reduce((acc, row) => {
    acc[[row.slot_day, row.slot_time, row.topic].join('||')] = !!row.completed;
    return acc;
  }, {});
}
function getClassFeeTarget(studentClass) {
  switch (String(studentClass || '').trim()) {
    case '12': return 14000; case '11': return 12000; case '10': return 10000; case '9': return 15000; default: return 0;
  }
}
function buildFeeSummary(studentId, studentClass) {
  const payments = db.prepare('SELECT amount_paid, paid_on, created_at FROM fee_payments WHERE student_id=? ORDER BY paid_on DESC, created_at DESC LIMIT 20').all(studentId);
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);
  const totalDue  = getClassFeeTarget(studentClass);
  return { totalDue, totalPaid: Math.round(totalPaid * 100) / 100, pending: Math.max(0, Math.round((totalDue - totalPaid) * 100) / 100), payments };
}
function buildTeacherStudentsSnapshot(selectedDate = '') {
  const students = db.prepare(`
    SELECT id, name, email, class, subject, approval_status, mobile, board, created_at
    FROM students
    WHERE COALESCE(approval_status, 'accepted') <> 'rejected'
    ORDER BY class, name
  `).all();
  const attendanceRows = db.prepare(`
    SELECT student_id,
           SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
           COUNT(*) AS total
    FROM attendance
    GROUP BY student_id
  `).all();
  const attendanceMap = new Map(
    attendanceRows.map((row) => [
      Number(row.student_id),
      {
        present: Number(row.present) || 0,
        total: Number(row.total) || 0
      }
    ])
  );
  const currentStatusMap = selectedDate
    ? new Map(
        db.prepare('SELECT student_id, status FROM attendance WHERE date=?').all(selectedDate).map((row) => [
          Number(row.student_id),
          row.status || null
        ])
      )
    : new Map();
  const feePaymentRows = db.prepare(`
    SELECT student_id, amount_paid, paid_on, created_at
    FROM fee_payments
    ORDER BY paid_on DESC, created_at DESC
  `).all();
  const feePaymentsMap = new Map();
  feePaymentRows.forEach((row) => {
    const studentId = Number(row.student_id);
    if (!feePaymentsMap.has(studentId)) feePaymentsMap.set(studentId, []);
    feePaymentsMap.get(studentId).push(row);
  });
  const latestWeeklyTests = db.prepare(`
    SELECT student_id, title, test_date, marks_obtained, total_marks
    FROM (
      SELECT student_id, title, test_date, marks_obtained, total_marks,
             ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY test_date DESC, created_at DESC) AS rn
      FROM weekly_tests
    ) ranked_tests
    WHERE rn = 1
  `).all();
  const latestWeeklyTestMap = new Map(
    latestWeeklyTests.map((row) => [Number(row.student_id), row])
  );

  return students.map((student) => {
    const studentId = Number(student.id);
    const attendanceStats = attendanceMap.get(studentId) || { present: 0, total: 0 };
    const totalPaid = (feePaymentsMap.get(studentId) || []).reduce((sum, payment) => {
      return sum + (Number(payment.amount_paid) || 0);
    }, 0);
    const totalDue = getClassFeeTarget(student.class);

    return {
      ...student,
      approvalStatus: String(student.approval_status || 'accepted').toLowerCase(),
      currentStatus: currentStatusMap.get(studentId) || null,
      attendance: {
        present: attendanceStats.present,
        total: attendanceStats.total,
        percentage: attendanceStats.total
          ? Math.round((attendanceStats.present / attendanceStats.total) * 1000) / 10
          : 0
      },
      feeSummary: {
        totalDue,
        totalPaid: Math.round(totalPaid * 100) / 100,
        pending: Math.max(0, Math.round((totalDue - totalPaid) * 100) / 100),
        payments: feePaymentsMap.get(studentId) || []
      },
      latestWeeklyTest: latestWeeklyTestMap.get(studentId) || null
    };
  });
}
function getStudentQuestionPapers(studentClass, studentSubject, studentBoard) {
  const safeClass = String(studentClass || '').trim();
  const safeSubject = normalizeStudentSubject(studentSubject, safeClass);
  const safeBoard = normalizeBoardScope(studentBoard);
  const dbPapers = db.prepare(`
    SELECT id, title, class_scope, COALESCE(subject_scope, 'all') AS subject_scope, COALESCE(board_scope, 'all') AS board_scope, resource_type, resource_url, posted_at
    FROM question_papers
    WHERE (class_scope=? OR class_scope='all')
      AND (COALESCE(subject_scope, 'all')='all' OR COALESCE(subject_scope, 'all')=?)
      AND (COALESCE(board_scope, 'all')='all' OR COALESCE(board_scope, 'all')=?)
    ORDER BY posted_at DESC
    LIMIT 10
  `).all(safeClass, safeSubject, safeBoard);
  return dbPapers;
}
function getStudentMcqStreak(studentId) {
  const rows = db.prepare("SELECT DISTINCT DATE(submitted_at) as day FROM daily_mcq_submissions WHERE student_id=? ORDER BY day DESC").all(studentId);
  let streak = 0;
  let cursor = new Date();
  for (const row of rows) {
    const day      = new Date(row.day + 'T00:00:00');
    const cursorDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    const diff     = Math.round((cursorDay - day) / (1000 * 60 * 60 * 24));
    if (diff === 0)          streak += 1;
    else if (diff === 1 && streak > 0) streak += 1;
    else if (diff > 1)       break;
    cursor = new Date(day.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}
function getStudentWeeklyTests(studentId) {
  return db.prepare('SELECT title, test_date, marks_obtained, total_marks, notes, created_at FROM weekly_tests WHERE student_id=? ORDER BY test_date DESC, created_at DESC LIMIT 10').all(studentId);
}
function getStudentActiveMcqSet(studentId, studentClass, studentSubject, studentBoard) {
  const safeClass = String(studentClass || '').trim();
  const safeSubject = normalizeStudentSubject(studentSubject, safeClass);
  const safeBoard = normalizeBoardScope(studentBoard);
  const latestBatch = db.prepare(`
    SELECT batch_title, available_until FROM daily_mcqs
    WHERE active=1 AND (class_scope='all' OR class_scope=?)
      AND (COALESCE(subject_scope, 'all')='all' OR COALESCE(subject_scope, 'all')=?)
      AND (COALESCE(board_scope, 'all')='all' OR COALESCE(board_scope, 'all')=?)
      AND (available_until IS NULL OR available_until >= CURRENT_TIMESTAMP)
    ORDER BY created_at DESC LIMIT 1
  `).get(safeClass, safeSubject, safeBoard);
  if (!latestBatch) return { batchTitle: null, availableUntil: null, questions: [] };
  const questions = db.prepare(`
    SELECT m.id, m.title, m.batch_title, m.question_no, m.question, m.question_image, m.options, m.available_until,
           s.selected_index, s.is_correct, s.submitted_at
    FROM daily_mcqs m
    LEFT JOIN daily_mcq_submissions s ON s.mcq_id = m.id AND s.student_id = ?
    WHERE m.active=1 AND m.batch_title = ? AND (m.class_scope='all' OR m.class_scope=?)
      AND (COALESCE(m.subject_scope, 'all')='all' OR COALESCE(m.subject_scope, 'all')=?)
      AND (COALESCE(m.board_scope, 'all')='all' OR COALESCE(m.board_scope, 'all')=?)
      AND (m.available_until IS NULL OR m.available_until >= CURRENT_TIMESTAMP)
    ORDER BY m.question_no ASC, m.created_at ASC
  `).all(studentId, latestBatch.batch_title, safeClass, safeSubject, safeBoard).map((mcq) => ({ ...mcq, options: JSON.parse(mcq.options || '[]') }));
  return { batchTitle: latestBatch.batch_title, availableUntil: latestBatch.available_until, questions };
}
function getRecentStudentMcqs(studentId, limit = 10) {
  return db.prepare(`
    SELECT m.id, m.title, m.batch_title, m.question_no, m.question,
           s.selected_index, s.is_correct, s.submitted_at
    FROM daily_mcq_submissions s
    JOIN daily_mcqs m ON m.id = s.mcq_id
    WHERE s.student_id=?
    ORDER BY s.submitted_at DESC, m.question_no ASC
    LIMIT ?
  `).all(studentId, limit);
}
function seedDefaultTeacher() {
  try {
    const teacherCount = db.prepare('SELECT COUNT(*) AS count FROM teachers').get().count;
    if (Number(teacherCount) > 0) return;
    const email    = (process.env.TEACHER_EMAIL || ALLOWED_TEACHER_EMAIL).toLowerCase().trim();
    const name     = process.env.TEACHER_NAME || 'I LEARN Staff';
    const password = process.env.TEACHER_PASSWORD || 'teacher123';
    const hash     = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO teachers (name, email, password) VALUES (?,?,?)').run(name, email, hash);
    console.log('[Teacher Seed] Default teacher login created:', email);
  } catch (e) { console.warn('[seedDefaultTeacher]', e.message); }
}

// ── ENV CONFIG ──────────────────────────────────────────────
const JWT_SECRET          = process.env.JWT_SECRET          || 'ilearn_fallback_secret';
const GOOGLE_CLIENT_ID    = process.env.GOOGLE_CLIENT_ID    || '';
const OPENAI_API_KEY      = process.env.OPENAI_API_KEY      || '';
const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID  || '';
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN   || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

async function callOpenAI(prompt, { system = '', model = 'gpt-4o-mini', maxOutputTokens = 1200 } = {}) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
  const input = [];
  if (system) input.push({ role: 'system', content: [{ type: 'input_text', text: system }] });
  input.push({ role: 'user', content: [{ type: 'input_text', text: prompt }] });
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input, max_output_tokens: maxOutputTokens })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'OpenAI request failed.');
  const text = data.output_text
    || data.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join('').trim()
    || '';
  if (!text) throw new Error('OpenAI returned an empty response.');
  return text;
}

function normalizeBoardName(board) {
  const value = String(board || '').toLowerCase();
  if (value.includes('cbse')) return 'CBSE';
  if (value.includes('state') || value.includes('tamil') || value.includes('samacheer') || value.includes('tn')) return 'Tamil Nadu State Board';
  return 'School Board';
}
function normalizeBoardScope(board) {
  const value = String(board || '').toLowerCase().trim();
  if (value.includes('cbse')) return 'cbse';
  return 'state';
}
function normalizeStudentSubject(subject, studentClass) {
  const cls   = String(studentClass || '').trim();
  const value = String(subject || '').toLowerCase().trim();
  if ((cls === '11' || cls === '12') && (value === 'business-maths' || value === 'business maths' || value === 'bm')) return 'business-maths';
  return 'maths';
}
function getSubjectDisplayName(subject, studentClass) {
  return normalizeStudentSubject(subject, studentClass) === 'business-maths' ? 'Business Maths' : 'Maths';
}
function getBoardMathTopics(studentClass, board, subject) {
  const cls           = String(studentClass || '').trim();
  const boardName     = normalizeBoardName(board);
  const normalizedSubject = normalizeStudentSubject(subject, cls);
  const topicMap = {
    '9':  ['Number Systems','Algebra','Linear Equations','Coordinate Geometry','Triangles','Mensuration','Statistics','Probability'],
    '10': ['Real Numbers','Polynomials','Quadratic Equations','Arithmetic Progressions','Triangles','Trigonometry','Circles','Statistics','Probability'],
    '11': ['Sets and Functions','Trigonometric Functions','Complex Numbers','Linear Inequalities','Permutations and Combinations','Straight Lines','Conic Sections','Statistics'],
    '12': ['Relations and Functions','Matrices','Determinants','Continuity and Differentiability','Applications of Derivatives','Integrals','Probability','Linear Programming']
  };
  const businessMathTopicMap = {
    '11': ['Matrices and Determinants','Algebra','Analytical Geometry','Trigonometry','Differential Calculus','Applications of Differentiation','Financial Mathematics','Descriptive Statistics and Probability','Correlation and Regression Analysis','Operations Research'],
    '12': ['Applications of Matrices and Determinants','Integral Calculus I','Integral Calculus II','Differential Equations','Numerical Methods','Random Variable and Mathematical Expectation','Probability Distributions','Sampling Techniques and Statistical Inference','Applied Statistics','Operations Research']
  };
  const topics = normalizedSubject === 'business-maths' && businessMathTopicMap[cls]
    ? businessMathTopicMap[cls]
    : (topicMap[cls] || ['Algebra','Geometry','Trigonometry','Statistics']);
  return { boardName, topics, subject: normalizedSubject, subjectName: getSubjectDisplayName(normalizedSubject, cls) };
}
function getDifficultyInstruction(level) {
  switch (String(level || '').toLowerCase().trim()) {
    case 'easy': return 'Keep the questions straightforward and confidence-building.';
    case 'hard': return 'Make the questions challenging but still syllabus-aligned.';
    case 'mixed': return 'Mix easy, medium, and hard questions in a balanced way.';
    default: return 'Keep the questions at a moderate board-exam level.';
  }
}
function extractJsonBlock(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) return fencedMatch[1].trim();
  const arrayStart = raw.indexOf('[');
  const arrayEnd = raw.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) return raw.slice(arrayStart, arrayEnd + 1);
  const objectStart = raw.indexOf('{');
  const objectEnd = raw.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) return raw.slice(objectStart, objectEnd + 1);
  return raw;
}
function sanitizeGeneratedMcq(item, index = 0) {
  const options = Array.isArray(item?.options) ? item.options.slice(0, 4).map((option) => {
    if (typeof option === 'string') return { text: option.trim(), imageUrl: '' };
    return {
      text: String(option?.text || '').trim(),
      imageUrl: String(option?.imageUrl || '').trim()
    };
  }) : [];
  if (options.length !== 4 || options.some((option) => !option.text && !option.imageUrl)) {
    throw new Error(`Generated MCQ ${index + 1} does not have 4 valid options.`);
  }
  const correctIndex = Number(item?.correctIndex);
  if (!String(item?.question || '').trim()) {
    throw new Error(`Generated MCQ ${index + 1} is missing question text.`);
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    throw new Error(`Generated MCQ ${index + 1} has an invalid correct option.`);
  }
  return {
    question: String(item.question).trim(),
    imageUrl: String(item?.imageUrl || '').trim(),
    options,
    correctIndex,
    explanation: String(item?.explanation || '').trim()
  };
}
function buildGeminiMcqPrompt({ classScope, boardScope, subjectScope, topic, difficulty, questionCount, questions, questionIndex }) {
  const cls = String(classScope || '').trim() || 'all';
  const board = cls === 'all' ? 'all boards' : (normalizeBoardScope(boardScope || 'state') === 'cbse' ? 'CBSE' : 'State Board');
  const subject = (cls === '11' || cls === '12')
    ? getSubjectDisplayName(subjectScope || 'maths', cls)
    : 'Maths';
  const regenerateMode = Number.isInteger(questionIndex);
  const currentQuestions = Array.isArray(questions) ? questions : [];
  const avoidList = currentQuestions
    .map((item, index) => index === questionIndex ? null : String(item?.question || '').trim())
    .filter(Boolean)
    .map((question, index) => `${index + 1}. ${question}`)
    .join('\n');
  return `
You are generating mathematics MCQs for a coaching academy teacher.

Target class: ${cls === 'all' ? 'Mixed classes' : `Class ${cls}`}
Board: ${board}
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}

${getDifficultyInstruction(difficulty)}

Return ONLY valid JSON.
${regenerateMode ? 'Return exactly one JSON object for a single replacement question.' : `Return a JSON array with exactly ${questionCount} question objects.`}

Each question object must have:
- question: string
- imageUrl: string (keep empty unless truly needed)
- options: array of exactly 4 objects with text and imageUrl
- correctIndex: 0, 1, 2, or 3
- explanation: short one-line explanation

Rules:
- Keep the questions syllabus-aligned for ${cls === 'all' ? 'the selected classes' : `Class ${cls}`}.
- Avoid duplicate questions.
- Avoid ambiguous answer choices.
- Prefer text-based questions unless an image is genuinely necessary.
- Do not include markdown, comments, or extra text.

${avoidList ? `Do not repeat these existing questions:\n${avoidList}\n` : ''}
${regenerateMode ? `Replace question number ${questionIndex + 1} with a fresh question from the same topic and difficulty.` : ''}
`.trim();
}
function getGeminiModelSequence() {
  const configured = String(process.env.GEMINI_MODEL_SEQUENCE || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (configured.length) return configured;
  return [
    String(process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim(),
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash-lite-preview-09-2025'
  ].filter(Boolean);
}
async function callGeminiForMcqs(payload) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Gemini API key is not configured on the server yet.');
  const models = [...new Set(getGeminiModelSequence())];
  const errors = [];
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildGeminiMcqPrompt(payload) }] }],
          generationConfig: {
            temperature: 0.8,
            responseMimeType: 'application/json'
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = data?.error?.message || `Gemini request failed for ${model}.`;
        errors.push(`${model}: ${errorMessage}`);
        continue;
      }
      const text = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '';
      const jsonBlock = extractJsonBlock(text);
      if (!jsonBlock) {
        errors.push(`${model}: Gemini returned an empty response.`);
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(jsonBlock);
      } catch {
        errors.push(`${model}: Gemini returned invalid JSON.`);
        continue;
      }
      return { modelUsed: model, parsed };
    } catch (error) {
      errors.push(`${model}: ${error.message || 'Unknown Gemini error.'}`);
    }
  }
  throw new Error(errors.join(' | ') || 'Could not generate MCQs with Gemini.');
}
function buildWeakTopicMcqPrompt({ classScope, boardScope, subjectScope, topic, focusTopics = [], questionCount, previousQuestions = [], starterMode = false }) {
  const cls = String(classScope || '').trim() || 'all';
  const board = cls === 'all' ? 'all boards' : (normalizeBoardScope(boardScope || 'state') === 'cbse' ? 'CBSE' : 'State Board');
  const subject = (cls === '11' || cls === '12')
    ? getSubjectDisplayName(subjectScope || 'maths', cls)
    : 'Maths';
  const avoidList = previousQuestions
    .map((item) => String(item?.question || '').trim())
    .filter(Boolean)
    .map((question, index) => `${index + 1}. ${question}`)
    .join('\n');
  return `
You are creating a weak-topic remedial MCQ test for a student.

Target class: ${cls === 'all' ? 'Mixed classes' : `Class ${cls}`}
Board: ${board}
Subject: ${subject}
${starterMode ? `Starter diagnostic topics to cover: ${focusTopics.join(', ')}` : `Weak topic to focus on: ${topic}`}

Return ONLY valid JSON.
Return a JSON array with exactly ${questionCount} question objects.

Each question object must have:
- question: string
- imageUrl: string (keep empty unless truly needed)
- options: array of exactly 4 objects with text and imageUrl
- correctIndex: 0, 1, 2, or 3
- explanation: short one-line explanation

Rules:
- ${starterMode ? `Spread the ${questionCount} questions across different topics from this list: ${focusTopics.join(', ')}. Avoid repeating the same topic too much.` : `Keep all questions strictly inside the weak topic: ${topic}.`}
- Make them one-mark / quick-practice level.
- Keep the language clear and student-friendly.
- Avoid duplicate questions.
- Prefer text-only questions unless an image is truly necessary.
- Do not include markdown or any extra text outside JSON.

${avoidList ? `Do not repeat these previous questions:\n${avoidList}\n` : ''}
`.trim();
}
async function callGeminiForWeakTopicTest(payload) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Gemini API key is not configured on the server yet.');
  const models = [...new Set(getGeminiModelSequence())];
  const errors = [];
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildWeakTopicMcqPrompt(payload) }] }],
          generationConfig: {
            temperature: 0.8,
            responseMimeType: 'application/json'
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        errors.push(`${model}: ${data?.error?.message || 'Gemini request failed.'}`);
        continue;
      }
      const text = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '';
      const jsonBlock = extractJsonBlock(text);
      if (!jsonBlock) {
        errors.push(`${model}: Gemini returned an empty response.`);
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(jsonBlock);
      } catch {
        errors.push(`${model}: Gemini returned invalid JSON.`);
        continue;
      }
      return { modelUsed: model, parsed };
    } catch (error) {
      errors.push(`${model}: ${error.message || 'Unknown Gemini error.'}`);
    }
  }
  throw new Error(errors.join(' | ') || 'Could not generate weak-topic MCQs with Gemini.');
}
function trySolveQuadraticFromText(message) {
  const compact = String(message || '').replace(/\s+/g, '').toLowerCase();
  const match   = compact.match(/([+-]?\d*)x\^2([+-]\d*)x([+-]\d+)=0/);
  if (!match) return null;
  const toCoeff = (value, fallbackOne = false) => {
    if (value === '' || value === '+') return fallbackOne ? 1 : 0;
    if (value === '-') return fallbackOne ? -1 : 0;
    return Number(value);
  };
  const a = toCoeff(match[1], true), b = toCoeff(match[2], true), c = Number(match[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) return null;
  const d = (b * b) - (4 * a * c);
  if (d < 0) return null;
  const sqrtD = Math.sqrt(d);
  if (!Number.isFinite(sqrtD)) return null;
  const root1 = (-b + sqrtD) / (2 * a), root2 = (-b - sqrtD) / (2 * a);
  const clean = (n) => Number.isInteger(n) ? String(n) : Number(n.toFixed(3)).toString();
  return [
    '**Mathi Demo Solution**',
    '1. Compare with ax^2 + bx + c = 0. Here a = ' + a + ', b = ' + b + ', c = ' + c + '.',
    '2. Discriminant: D = b^2 - 4ac = ' + b + '^2 - 4(' + a + ')(' + c + ') = ' + d + '.',
    '3. Quadratic formula: x = (-b ± √D) / 2a.',
    '4. Substitute: x = (' + (-b) + ' ± ' + clean(sqrtD) + ') / ' + (2 * a) + '.',
    '5. Roots: x = ' + clean(root1) + ' and x = ' + clean(root2) + '.',
    '6. Check by substituting each root back into the equation.',
    'Ask Mathi again: factorisation method or explain step 2.'
  ].join('\n');
}
function buildMathiDemoReply(message, student = {}) {
  const question = String(message || '').trim();
  const lower    = question.toLowerCase();
  const cls      = String(student.class || '').trim() || '9';
  const boardInfo = getBoardMathTopics(cls, student.board);
  const quadratic = trySolveQuadraticFromText(question);
  if (quadratic) return quadratic;
  const topicHints = [];
  if (lower.includes('trig') || lower.includes('sin') || lower.includes('cos') || lower.includes('tan')) {
    topicHints.push('Use the correct trigonometric identity or standard value first.');
    topicHints.push('Write the formula clearly before substituting values.');
    topicHints.push('Check whether the angle is in degrees and simplify step by step.');
  }
  if (lower.includes('derivative') || lower.includes('differentiate')) {
    topicHints.push('Identify the function type first: power, product, quotient, or chain rule.');
    topicHints.push('Differentiate one step at a time and simplify only after applying the rule.');
  }
  if (lower.includes('integrat')) {
    topicHints.push('Check whether substitution, standard formula, or integration by parts applies.');
    topicHints.push("After integrating, do not forget the constant of integration C.");
  }
  if (lower.includes('probability')) {
    topicHints.push('Write probability as favourable outcomes divided by total outcomes.');
    topicHints.push('Make sure both counts come from the same sample space.');
  }
  if (lower.includes('matrix') || lower.includes('determinant')) {
    topicHints.push('Check the order of the matrix first.');
    topicHints.push('Use row-column multiplication carefully and keep signs correct.');
  }
  if (lower.includes('triangle') || lower.includes('geometry') || lower.includes('circle')) {
    topicHints.push('Draw a neat figure and mark the given values before solving.');
    topicHints.push('Choose the theorem that matches the figure, then justify each step.');
  }
  const guided = topicHints.length ? topicHints : [
    'Read the question once and identify exactly what must be found.',
    'List the given values, formula, and topic before starting the calculation.',
    'Solve one step at a time and keep the units or algebra signs correct.',
    'Check the final answer by substitution or estimation.'
  ];
  return [
    '**Mathi** is in demo tutor mode for Class ' + cls + ' ' + boardInfo.boardName + ' Maths.',
    '',
    'I understood your doubt as: "' + question + '".',
    '',
    '**How to solve it properly:**',
    '1. Identify the chapter/topic. Related topics: ' + boardInfo.topics.slice(0, 4).join(', ') + '.',
    '2. Write the known data from the question clearly.',
    '3. Pick the right formula or theorem before calculating.',
    ...guided.map((step, index) => (index + 4) + '. ' + step),
    '',
    '**Mathi can guide you better if you send:**',
    '- the full equation or sum exactly as in the book',
    '- the class and board if it matters',
    '- what step you are stuck on',
    '',
    'Try asking like:',
    '- Solve x^2 - 5x + 6 = 0 step by step',
    '- Explain the sine rule for Class 10',
    '- Differentiate x^3 + 4x',
    '- Find the probability of getting an even number on a die'
  ].join('\n');
}
function buildDemoTimetable(student, payload) {
  const cls        = String(student?.class || '9').trim();
  const boardInfo  = getBoardMathTopics(cls, student?.board, student?.subject || payload?.subject);
  const availableDays    = Array.isArray(payload.availableDays) && payload.availableDays.length ? payload.availableDays : ['Mon','Tue','Wed','Thu','Fri'];
  const requestedWeakTopics = Array.isArray(payload.weakTopics) ? payload.weakTopics : [];
  const filteredWeakTopics  = requestedWeakTopics.filter((topic) => boardInfo.topics.includes(topic));
  const weakTopics   = filteredWeakTopics.length ? filteredWeakTopics : boardInfo.topics.slice(0, 3);
  const allTopics    = Array.from(new Set([...weakTopics, ...boardInfo.topics]));
  const sessionLength  = String(payload.sessionLength || '45 min');
  const preferredTime  = String(payload.preferredTime || 'Evening (4-8 PM)');
  const goal           = String(payload.goal || 'Board Exams');
  const weeksToExam    = Math.max(1, Number(payload.weeksToExam || 8));
  const confidence     = String(payload.confidence || 'Average').toLowerCase();
  const hoursPerDay    = Math.max(1, Number(payload.hoursPerDay || 2));
  const slotsPerDay    = Math.max(1, Math.min(4, Math.round((hoursPerDay * 60) / Math.max(30, parseInt(sessionLength, 10) || 45))));
  const urgency        = weeksToExam <= 4 ? 'high' : (weeksToExam <= 8 ? 'medium' : 'steady');
  const weeklyPlan     = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
  const timeMap = {
    'Early Morning (5-8 AM)': ['5:30 AM','6:20 AM','7:10 AM','8:00 AM'],
    'Morning (8-12 PM)':      ['8:00 AM','9:00 AM','10:15 AM','11:15 AM'],
    'Afternoon (12-4 PM)':    ['12:30 PM','1:30 PM','2:45 PM','3:30 PM'],
    'Evening (4-8 PM)':       ['4:30 PM','5:30 PM','6:45 PM','7:30 PM'],
    'Night (8-11 PM)':        ['8:00 PM','8:50 PM','9:40 PM','10:20 PM']
  };
  const slotTimes = timeMap[preferredTime] || timeMap['Evening (4-8 PM)'];
  const typeCycle = urgency === 'high'
    ? ['study','practice','revision','test']
    : urgency === 'medium'
      ? ['study','practice','revision','doubt']
      : ['study','practice','doubt','revision'];
  const confidenceBoost = confidence.includes('low') ? 2 : (confidence.includes('average') ? 1 : 0);
  const weakFocus = weakTopics.map((topic, index) => ({
    topic,
    extraSessions: Math.max(2, (urgency === 'high' ? 3 : 2) + (index < confidenceBoost ? 1 : 0)),
    reason: 'Mathi is repeating this topic more often because it was marked as weak and needs confidence-building practice.'
  }));
  let pointer = 0;
  availableDays.forEach((day, dayIndex) => {
    const sessions  = [];
    const isWeekend = day === 'Sat' || day === 'Sun';
    const dailySlots = Math.max(1, Math.min(4, slotsPerDay + (isWeekend && urgency !== 'steady' ? 1 : 0)));
    for (let slotIndex = 0; slotIndex < dailySlots; slotIndex++) {
      let topic;
      if (slotIndex === 0) {
        topic = weakTopics[(dayIndex + slotIndex) % weakTopics.length] || allTopics[pointer % allTopics.length];
      } else if (slotIndex === dailySlots - 1 && urgency === 'high') {
        topic = 'Mixed Test and Error Review';
      } else {
        topic = allTopics[pointer % allTopics.length];
      }
      const type = topic === 'Mixed Test and Error Review' ? 'test' : typeCycle[(dayIndex + slotIndex) % typeCycle.length];
      sessions.push({ time: slotTimes[Math.min(slotIndex, slotTimes.length - 1)], topic, type, duration: sessionLength });
      pointer += 1;
    }
    weeklyPlan[day] = sessions;
  });
  const summaryParts = [
    (student?.name || 'Student') + ', this is your Smart Timetable for Class ' + cls + ' ' + boardInfo.boardName + ' ' + boardInfo.subjectName + '.',
    'Goal focus: ' + goal + '.',
    urgency === 'high'
      ? 'Your exam is close, so Smart Timetable has added more revision and test blocks.'
      : urgency === 'medium'
        ? 'Smart Timetable is balancing concept learning with regular revision before the exam.'
        : 'Smart Timetable is building a steady weekly routine to strengthen your basics first.'
  ];
  const tips = [
    'Begin each study session by revising the previous formula or mistake for 5 minutes.',
    'After every practice or test block, mark one doubt and ask the chatbot the exact step where you got stuck.',
    urgency === 'high'
      ? 'Finish the final session of the day with a quick written self-test to improve exam speed.'
      : 'Keep one separate notebook for worked examples and repeated mistakes.'
  ];
  return { summary: summaryParts.join(' '), weeklyPlan, weakFocus, tips };
}
function hasTwilioConfig() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
}
async function sendOtpSms(mobileDigits, otp) {
  if (!hasTwilioConfig()) return { delivered: false, provider: 'console' };
  const to   = '+91' + mobileDigits;
  const body = new URLSearchParams({
    To: to, From: TWILIO_PHONE_NUMBER,
    Body: 'Your I LEARN Academy OTP is ' + otp + '. It expires in 10 minutes.'
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  if (!response.ok) { const t = await response.text(); throw new Error('Twilio SMS failed: ' + t); }
  return { delivered: true, provider: 'twilio' };
}

// ── DATABASE SETUP ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id          SERIAL PRIMARY KEY,
    name        TEXT    NOT NULL,
    email       TEXT    UNIQUE NOT NULL,
    password    TEXT    NOT NULL,
    google_sub  TEXT,
    class       TEXT    NOT NULL,
    subject     TEXT    DEFAULT 'maths',
    approval_status TEXT DEFAULT 'accepted',
    mobile      TEXT    NOT NULL,
    board       TEXT    DEFAULT 'state',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS parents (
    id          SERIAL PRIMARY KEY,
    mobile      TEXT    UNIQUE NOT NULL,
    otp         TEXT,
    otp_expiry  TIMESTAMP,
    student_id  INTEGER REFERENCES students(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS assessments (
    id            SERIAL PRIMARY KEY,
    student_id    INTEGER NOT NULL REFERENCES students(id),
    class         TEXT    NOT NULL,
    score         INTEGER NOT NULL,
    total         INTEGER NOT NULL,
    topic_scores  TEXT    NOT NULL,
    weak_topics   TEXT,
    strong_topics TEXT,
    taken_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER REFERENCES students(id),
    session_key TEXT    NOT NULL UNIQUE,
    messages    TEXT    NOT NULL DEFAULT '[]',
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS timetables (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(id),
    schedule    TEXT    NOT NULL,
    weak_topics TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS teachers (
    id          SERIAL PRIMARY KEY,
    name        TEXT    NOT NULL,
    email       TEXT    UNIQUE NOT NULL,
    password    TEXT    NOT NULL,
    google_sub  TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS timetable_completions (
    id           SERIAL PRIMARY KEY,
    timetable_id INTEGER NOT NULL REFERENCES timetables(id),
    student_id   INTEGER NOT NULL REFERENCES students(id),
    slot_day     TEXT    NOT NULL,
    slot_time    TEXT    NOT NULL,
    topic        TEXT    NOT NULL,
    completed    INTEGER NOT NULL DEFAULT 0,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(timetable_id, student_id, slot_day, slot_time, topic)
  );
  CREATE TABLE IF NOT EXISTS daily_mcqs (
    id              SERIAL PRIMARY KEY,
    teacher_id      INTEGER REFERENCES teachers(id),
    title           TEXT    NOT NULL,
    batch_title     TEXT,
    question_no     INTEGER DEFAULT 1,
    question        TEXT,
    question_image  TEXT,
    options         TEXT    NOT NULL,
    correct_index   INTEGER NOT NULL,
    class_scope     TEXT    DEFAULT 'all',
    subject_scope   TEXT    DEFAULT 'all',
    board_scope     TEXT    DEFAULT 'all',
    active          INTEGER NOT NULL DEFAULT 1,
    available_until TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS daily_mcq_submissions (
    id             SERIAL PRIMARY KEY,
    mcq_id         INTEGER NOT NULL REFERENCES daily_mcqs(id),
    student_id     INTEGER NOT NULL REFERENCES students(id),
    selected_index INTEGER NOT NULL,
    is_correct     INTEGER NOT NULL DEFAULT 0,
    submitted_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mcq_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS question_papers (
    id            SERIAL PRIMARY KEY,
    teacher_id    INTEGER REFERENCES teachers(id),
    title         TEXT    NOT NULL,
    class_scope   TEXT    DEFAULT 'all',
    subject_scope TEXT    DEFAULT 'all',
    board_scope   TEXT    DEFAULT 'all',
    resource_type TEXT    DEFAULT 'pdf',
    resource_url  TEXT    NOT NULL,
    posted_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS weekly_tests (
    id             SERIAL PRIMARY KEY,
    teacher_id     INTEGER REFERENCES teachers(id),
    student_id     INTEGER NOT NULL REFERENCES students(id),
    title          TEXT    NOT NULL,
    test_date      TEXT    NOT NULL,
    marks_obtained DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_marks    DOUBLE PRECISION NOT NULL DEFAULT 100,
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS fee_payments (
    id          SERIAL PRIMARY KEY,
    teacher_id  INTEGER REFERENCES teachers(id),
    student_id  INTEGER NOT NULL REFERENCES students(id),
    amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
    paid_on     TEXT    NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(id),
    date        TEXT    NOT NULL,
    status      TEXT    DEFAULT 'present',
    UNIQUE(student_id, date)
  );
  CREATE TABLE IF NOT EXISTS doubts (
    id             SERIAL PRIMARY KEY,
    student_id     INTEGER NOT NULL REFERENCES students(id),
    teacher_id     INTEGER REFERENCES teachers(id),
    question_text  TEXT    NOT NULL,
    question_image TEXT,
    answer_text    TEXT,
    answer_image   TEXT,
    status         TEXT    DEFAULT 'open',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at    TIMESTAMP
  );
`);

// Safe column additions — IF NOT EXISTS prevents errors on redeploy
[
  "ALTER TABLE students  ADD COLUMN IF NOT EXISTS google_sub       TEXT",
  "ALTER TABLE students  ADD COLUMN IF NOT EXISTS subject          TEXT DEFAULT 'maths'",
  "ALTER TABLE students  ADD COLUMN IF NOT EXISTS approval_status  TEXT DEFAULT 'accepted'",
  "ALTER TABLE teachers  ADD COLUMN IF NOT EXISTS google_sub       TEXT",
  "ALTER TABLE daily_mcqs ADD COLUMN IF NOT EXISTS batch_title     TEXT",
  "ALTER TABLE daily_mcqs ADD COLUMN IF NOT EXISTS question_no     INTEGER DEFAULT 1",
  "ALTER TABLE daily_mcqs ADD COLUMN IF NOT EXISTS available_until TIMESTAMP",
  "ALTER TABLE daily_mcqs ADD COLUMN IF NOT EXISTS question_image  TEXT",
  "ALTER TABLE daily_mcqs ADD COLUMN IF NOT EXISTS subject_scope   TEXT DEFAULT 'all'",
  "ALTER TABLE daily_mcqs ADD COLUMN IF NOT EXISTS board_scope     TEXT DEFAULT 'all'",
  "ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS subject_scope TEXT DEFAULT 'all'",
  "ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS board_scope   TEXT DEFAULT 'all'",
].forEach((sql) => { try { db.prepare(sql).run(); } catch (e) { /* already exists — ignore */ } });

// PostgreSQL already treats NULLs as distinct in unique indexes.
try {
  db.prepare(
    USING_POSTGRES
      ? 'CREATE UNIQUE INDEX IF NOT EXISTS idx_students_google_sub ON students (google_sub)'
      : 'CREATE UNIQUE INDEX IF NOT EXISTS idx_students_google_sub ON students (google_sub) WHERE google_sub IS NOT NULL'
  ).run();
} catch (e) { /* ignore */ }
try {
  db.prepare(
    USING_POSTGRES
      ? 'CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_google_sub ON teachers (google_sub)'
      : 'CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_google_sub ON teachers (google_sub) WHERE google_sub IS NOT NULL'
  ).run();
} catch (e) { /* ignore */ }

seedDefaultTeacher();

// ── MIDDLEWARE ───────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const limiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const otpLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: 'Too many OTP requests. Wait 1 minute.' } });
app.use('/api/', limiter);

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
function authStudent(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const student = db.prepare('SELECT id, approval_status FROM students WHERE id=?').get(decoded.id);
    if (!student) return res.status(401).json({ error: 'Student account not found. Please login again.' });
    if (String(student.approval_status || 'accepted').toLowerCase() === 'rejected')
      return res.status(403).json({ error: 'Your account has been blocked by the teacher. Please contact the academy.' });
    req.student = decoded;
    next();
  } catch { res.status(401).json({ error: 'Session expired. Please login again.' }); }
}
function authParent(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Parent login required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'parent') return res.status(403).json({ error: 'Not a parent account' });
    const studentId = decoded.studentId || null;
    if (studentId) {
      const student = db.prepare('SELECT id, approval_status FROM students WHERE id=?').get(studentId);
      if (!student) return res.status(401).json({ error: 'Student account not found. Please login again.' });
      if (String(student.approval_status || 'accepted').toLowerCase() === 'rejected')
        return res.status(403).json({ error: 'This account has been blocked by the teacher. Please contact the academy.' });
    }

    req.parent = { ...decoded, studentId };
    next();
  } catch { res.status(401).json({ error: 'Session expired. Please login again.' }); }
}
function authTeacher(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Teacher login required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'teacher') return res.status(403).json({ error: 'Not a teacher account' });
    req.teacher = decoded;
    next();
  } catch { res.status(401).json({ error: 'Session expired. Please login again.' }); }
}

// ============================================================
//  TEACHER LOGIN
// ============================================================
app.post('/api/teacher/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail || !password) return res.status(400).json({ error: 'Teacher email and password are required' });
  if (normalizedEmail !== ALLOWED_TEACHER_EMAIL) return res.status(401).json({ error: 'Teacher access is not allowed for this account.' });
  const teacher = db.prepare('SELECT id, name, email, password FROM teachers WHERE email=?').get(normalizedEmail);
  if (!teacher) return res.status(401).json({ error: 'Invalid teacher login' });
  const match = await bcrypt.compare(password, teacher.password);
  if (!match) return res.status(401).json({ error: 'Invalid teacher login' });
  const token = jwt.sign({ role: 'teacher', id: teacher.id, name: teacher.name, email: teacher.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, teacher: { id: teacher.id, name: teacher.name, email: teacher.email } });
});

app.post('/api/teacher/google-login', async (req, res) => {
  if (!googleClient || !GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google login is not configured on the server.' });
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential is required.' });
  try {
    const ticket  = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const googleSub = payload?.sub;
    const email     = payload?.email?.toLowerCase().trim();
    if (!googleSub || !email || !payload?.email_verified) return res.status(401).json({ error: 'Google account could not be verified.' });
    if (email !== ALLOWED_TEACHER_EMAIL) return res.status(401).json({ error: 'Teacher access is not allowed for this account.' });
    let teacher = db.prepare('SELECT id, name, email, google_sub FROM teachers WHERE google_sub=? OR email=? LIMIT 1').get(googleSub, email);
    if (!teacher) {
      const result = db.prepare('INSERT INTO teachers (name, email, password, google_sub) VALUES (?,?,?,?)').run(payload.name?.trim() || 'Teacher', email, bcrypt.hashSync('google-only-' + Date.now(), 10), googleSub);
      teacher = db.prepare('SELECT id, name, email FROM teachers WHERE id=?').get(result.lastInsertRowid);
    } else {
      db.prepare('UPDATE teachers SET name=?, google_sub=? WHERE id=?').run(payload.name?.trim() || teacher.name, googleSub, teacher.id);
      teacher = db.prepare('SELECT id, name, email FROM teachers WHERE id=?').get(teacher.id);
    }
    const token = jwt.sign({ role: 'teacher', id: teacher.id, name: teacher.name, email: teacher.email, googleSub }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, teacher: { id: teacher.id, name: teacher.name, email: teacher.email } });
  } catch (err) {
    console.error('Teacher Google login error:', err.message);
    res.status(401).json({ error: 'Teacher Google sign-in failed. Please try again.' });
  }
});

// ============================================================
//  STUDENT ROUTES
// ============================================================
app.post('/api/student/register', async (req, res) => {
  const { name, email, password, class: cls, mobile, board, subject } = req.body;
  const normalizedSubject = normalizeStudentSubject(subject, cls);
  const normalizedBoard   = normalizeBoardScope(board || 'state');
  const normalizedEmail   = email ? email.toLowerCase().trim() : '';
  if (!name || !email || !cls || !mobile || !board) return res.status(400).json({ error: 'All fields are required' });
  if ((cls === '11' || cls === '12') && !subject) return res.status(400).json({ error: 'Please choose Maths or Business Maths for Class 11 and 12.' });
  if (!email.includes('@'))                        return res.status(400).json({ error: 'Invalid email address' });
  if (mobile.replace(/\D/g, '').length < 10)       return res.status(400).json({ error: 'Invalid mobile number' });
  const existingStudent = db.prepare('SELECT id, approval_status FROM students WHERE email=?').get(normalizedEmail);
  if (existingStudent && String(existingStudent.approval_status || 'accepted').toLowerCase() === 'rejected')
    return res.status(403).json({ error: 'This email has been blocked by the teacher. Please contact the academy.' });
  try {
    const hash   = await bcrypt.hash(password || ('google-only-' + Date.now()), 10);
    const result = db.prepare('INSERT INTO students (name, email, password, class, subject, approval_status, mobile, board) VALUES (?,?,?,?,?,?,?,?)').run(name, normalizedEmail, hash, cls, normalizedSubject, 'accepted', mobile.trim(), normalizedBoard);
    const mobileDigits    = mobile.replace(/\D/g, '').slice(-10);
    const existingParent  = db.prepare('SELECT id FROM parents WHERE mobile=?').get(mobileDigits);
    if (existingParent) { db.prepare('UPDATE parents SET student_id=? WHERE mobile=?').run(result.lastInsertRowid, mobileDigits); }
    else                { db.prepare('INSERT INTO parents (mobile, student_id) VALUES (?,?)').run(mobileDigits, result.lastInsertRowid); }
    const token = jwt.sign({ id: result.lastInsertRowid, name, email: normalizedEmail, class: cls, subject: normalizedSubject }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ success: true, token, student: { id: result.lastInsertRowid, name, email: normalizedEmail, class: cls, subject: normalizedSubject, board: normalizedBoard, approvalStatus: 'accepted', mobile } });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique')) return res.status(409).json({ error: 'This email is already registered. Please login.' });
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/student/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const student = db.prepare('SELECT * FROM students WHERE email=?').get(email.toLowerCase().trim());
  if (!student) return res.status(401).json({ error: 'Invalid email or password' });
  if (String(student.approval_status || 'accepted').toLowerCase() === 'rejected')
    return res.status(403).json({ error: 'Your account has been blocked by the teacher. Please contact the academy.' });
  const match = await bcrypt.compare(password, student.password);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: student.id, name: student.name, email: student.email, class: student.class, subject: normalizeStudentSubject(student.subject, student.class) }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, student: { id: student.id, name: student.name, email: student.email, class: student.class, subject: normalizeStudentSubject(student.subject, student.class), approvalStatus: String(student.approval_status || 'accepted').toLowerCase(), mobile: student.mobile } });
});

app.post('/api/student/google-login', async (req, res) => {
  if (!googleClient || !GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google login is not configured on the server.' });
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential is required.' });
  try {
    const ticket  = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const googleSub = payload?.sub;
    const email     = payload?.email?.toLowerCase().trim();
    if (!googleSub || !email || !payload?.email_verified) return res.status(401).json({ error: 'Google account could not be verified.' });
    let student = db.prepare('SELECT id, name, email, class, subject, approval_status, mobile, board, google_sub FROM students WHERE google_sub=? OR email=? LIMIT 1').get(googleSub, email);
    if (!student) return res.status(401).json({ error: 'This Google email is not registered yet. Please complete student registration first.' });
    if (String(student.approval_status || 'accepted').toLowerCase() === 'rejected')
      return res.status(403).json({ error: 'Your account has been blocked by the teacher. Please contact the academy.' });
    if (!student.google_sub) { db.prepare('UPDATE students SET google_sub=?, name=? WHERE id=?').run(googleSub, payload.name?.trim() || student.name, student.id); }
    const token = jwt.sign({ id: student.id, name: student.name, email: student.email, class: student.class, subject: normalizeStudentSubject(student.subject, student.class), googleSub }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, student: { id: student.id, name: student.name, email: student.email, class: student.class, subject: normalizeStudentSubject(student.subject, student.class), approvalStatus: String(student.approval_status || 'accepted').toLowerCase(), mobile: student.mobile, board: student.board } });
  } catch (err) {
    console.error('Google login error:', err.message);
    res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
  }
});

app.get('/api/student/profile', authStudent, (req, res) => {
  const studentId = req.student.id;
  const student   = db.prepare('SELECT id, name, email, class, subject, approval_status, mobile, board, created_at FROM students WHERE id=?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const latestAssessment = db.prepare('SELECT * FROM assessments WHERE student_id=? ORDER BY taken_at DESC LIMIT 1').get(studentId);
  const latestTimetable  = db.prepare('SELECT * FROM timetables WHERE student_id=? ORDER BY created_at DESC LIMIT 1').get(studentId);
  const thisMonth        = getCurrentMonthPrefix();
  const monthAttendance  = buildAttendanceSummary(studentId, thisMonth);
  const overallAttendance= buildAttendanceSummary(studentId);
  const dailyMcqSet      = getStudentActiveMcqSet(studentId, student.class, student.subject, student.board);
  const questionPapers   = getStudentQuestionPapers(student.class, student.subject, student.board);
  const weeklyTests      = getStudentWeeklyTests(studentId);
  const feeSummary       = buildFeeSummary(studentId, student.class);
  const mcqStreak        = getStudentMcqStreak(studentId);
  const weeklySummary    = buildWeeklyStudentSummary(studentId);
  const recentMcqs       = getRecentStudentMcqs(studentId);
  res.json({
    student, latestAssessment, latestTimetable,
    attendance: { present: monthAttendance.present },
    totalAttendance: { total: monthAttendance.total },
    attendanceSummary: { month: monthAttendance, overall: overallAttendance },
    dailyMcqSet, questionPapers, weeklyTests, feeSummary, mcqStreak, weeklySummary, recentMcqs
  });
});

app.get('/api/student/dashboard/attendance', authStudent, (req, res) => {
  try {
    const studentId = req.student.id;
    const student = db.prepare('SELECT id, name, class FROM students WHERE id=?').get(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const monthKey = getCurrentMonthPrefix();
    const monthAttendance = buildAttendanceSummary(studentId, monthKey);
    const overallAttendance = buildAttendanceSummary(studentId);
    const weeklySummary = buildWeeklyStudentSummary(studentId);
    res.json({
      student,
      attendanceSummary: {
        month: monthAttendance,
        overall: overallAttendance
      },
      weeklySummary: weeklySummary?.attendance || { present: 0, total: 0, percentage: 0 }
    });
  } catch (error) {
    console.error('[GET /api/student/dashboard/attendance]', error.message);
    res.status(500).json({ error: 'Could not load student attendance card.' });
  }
});

app.get('/api/student/dashboard/fees', authStudent, (req, res) => {
  try {
    const studentId = req.student.id;
    const student = db.prepare('SELECT id, name, class FROM students WHERE id=?').get(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const feeSummary = buildFeeSummary(studentId, student.class);
    res.json({ student, feeSummary });
  } catch (error) {
    console.error('[GET /api/student/dashboard/fees]', error.message);
    res.status(500).json({ error: 'Could not load student fee card.' });
  }
});

app.get('/api/student/dashboard/weekly-tests', authStudent, (req, res) => {
  try {
    const studentId = req.student.id;
    const student = db.prepare('SELECT id, name, class FROM students WHERE id=?').get(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const weeklyTests = getStudentWeeklyTests(studentId);
    const latestAssessment = db.prepare('SELECT * FROM assessments WHERE student_id=? ORDER BY taken_at DESC LIMIT 1').get(studentId);
    const topicScores = latestAssessment?.topic_scores ? JSON.parse(latestAssessment.topic_scores || '{}') : {};
    const weakTopics = latestAssessment?.weak_topics ? JSON.parse(latestAssessment.weak_topics || '[]') : [];
    const strongTopics = latestAssessment?.strong_topics ? JSON.parse(latestAssessment.strong_topics || '[]') : [];
    res.json({ student, weeklyTests, topicScores, weakTopics, strongTopics });
  } catch (error) {
    console.error('[GET /api/student/dashboard/weekly-tests]', error.message);
    res.status(500).json({ error: 'Could not load student weekly test card.' });
  }
});

// ============================================================
//  PARENT ROUTES
// ============================================================
app.post('/api/parent/send-otp', otpLimiter, async (req, res) => {
  return res.status(410).json({ error: 'Parent OTP login has been removed. Please use Google login with the linked student Gmail.' });
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ error: 'Mobile number required' });
  const digits  = mobile.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
  const parent  = db.prepare('SELECT * FROM parents WHERE mobile=?').get(digits);
  const student = parent?.student_id ? db.prepare('SELECT name,class FROM students WHERE id=?').get(parent.student_id) : null;
  const otp     = Math.floor(1000 + Math.random() * 9000).toString();
  const expiry  = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  if (parent) { db.prepare('UPDATE parents SET otp=?, otp_expiry=? WHERE mobile=?').run(otp, expiry, digits); }
  else        { db.prepare('INSERT INTO parents (mobile, otp, otp_expiry) VALUES (?,?,?)').run(digits, otp, expiry); }
  try {
    const sms = await sendOtpSms(digits, otp);
    if (!sms.delivered) console.log(`[OTP] ${digits} -> ${otp}`);
    return res.json({
      success: true,
      message: sms.delivered ? 'OTP sent to ' + mobile : 'OTP generated for ' + mobile + '. Add Twilio credentials in .env to send real SMS.',
      studentFound: !!student, studentName: student?.name || null, studentClass: student?.class || null,
      demo_otp: sms.delivered ? undefined : otp
    });
  } catch (err) {
    console.error('Parent OTP SMS error:', err.message);
    console.log(`[OTP fallback] ${digits} -> ${otp}`);
    return res.json({
      success: true, message: 'OTP generated (SMS delivery failed — check Twilio config).',
      studentFound: !!student, studentName: student?.name || null, studentClass: student?.class || null, demo_otp: otp
    });
  }
});

app.post('/api/parent/verify-otp', (req, res) => {
  return res.status(410).json({ error: 'Parent OTP login has been removed. Please use Google login with the linked student Gmail.' });
  const { mobile, otp } = req.body;
  if (!mobile || !otp) return res.status(400).json({ error: 'Mobile and OTP required' });
  const digits = mobile.replace(/\D/g, '').slice(-10);
  const parent = db.prepare('SELECT * FROM parents WHERE mobile=?').get(digits);
  if (!parent) return res.status(401).json({ error: 'Mobile number not registered. Ask your child to register first.' });
  if (parent.otp !== otp.toString().trim()) return res.status(401).json({ error: 'Incorrect OTP. Please try again.' });
  if (new Date(parent.otp_expiry) < new Date()) return res.status(401).json({ error: 'OTP has expired. Please request a new one.' });
  db.prepare('UPDATE parents SET otp=NULL, otp_expiry=NULL WHERE mobile=?').run(digits);
  const student = parent.student_id ? db.prepare('SELECT id, name, class, mobile, approval_status FROM students WHERE id=?').get(parent.student_id) : null;
  if (student && String(student.approval_status || 'accepted').toLowerCase() === 'rejected')
    return res.status(403).json({ error: 'This account has been blocked by the teacher. Please contact the academy.' });
  const token = jwt.sign({ role: 'parent', mobile: digits, studentId: student?.id || null }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ success: true, token, student: student || null, message: student ? `Verified! Redirecting to ${student.name}'s report.` : 'Verified!' });
});

app.post('/api/parent/google-login', async (req, res) => {
  if (!googleClient || !GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google login is not configured on the server.' });
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential is required.' });
  try {
    const ticket  = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const googleSub = payload?.sub;
    const email     = payload?.email?.toLowerCase().trim();
    if (!googleSub || !email || !payload?.email_verified) return res.status(401).json({ error: 'Google account could not be verified.' });
    let student = db.prepare('SELECT id, name, email, class, subject, mobile, board, google_sub, approval_status, created_at FROM students WHERE google_sub=? OR email=? LIMIT 1').get(googleSub, email);
    if (!student) return res.status(401).json({ error: 'This Google account is not linked to any registered student. Please use the same Gmail as the student account.' });
    if (String(student.approval_status || 'accepted').toLowerCase() === 'rejected')
      return res.status(403).json({ error: 'This account has been blocked by the teacher. Please contact the academy.' });
    if (!student.google_sub) { db.prepare('UPDATE students SET google_sub=? WHERE id=?').run(googleSub, student.id); }
    const token = jwt.sign({ role: 'parent', studentId: student.id, email: student.email, googleSub }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        class: student.class,
        subject: normalizeStudentSubject(student.subject, student.class),
        mobile: student.mobile,
        board: student.board,
        approvalStatus: String(student.approval_status || 'accepted').toLowerCase(),
        createdAt: student.created_at
      }
    });
  } catch (err) {
    console.error('Parent Google login error:', err.message);
    res.status(401).json({ error: 'Parent Google sign-in failed. Please try again.' });
  }
});

app.get('/api/parent/report', authParent, (req, res) => {
  const { studentId } = req.parent;
  if (!studentId) return res.status(404).json({ error: 'No student linked to this parent account' });
  const student = db.prepare('SELECT id, name, email, class, subject, mobile, board, approval_status, created_at FROM students WHERE id=?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const assessments      = db.prepare('SELECT * FROM assessments WHERE student_id=? ORDER BY taken_at DESC LIMIT 5').all(studentId);
  const latestAssessment = assessments[0] || null;
  const latestTimetable  = db.prepare('SELECT * FROM timetables WHERE student_id=? ORDER BY created_at DESC LIMIT 1').get(studentId) || null;
  const thisMonth        = getCurrentMonthPrefix();
  const monthAttendance  = buildAttendanceSummary(studentId, thisMonth);
  const overallAttendance= buildAttendanceSummary(studentId);
  const dailyMcqSet      = getStudentActiveMcqSet(studentId, student.class, student.subject, student.board);
  const questionPapers   = getStudentQuestionPapers(student.class, student.subject, student.board);
  const weeklyTests      = getStudentWeeklyTests(studentId);
  const feeSummary       = buildFeeSummary(studentId, student.class);
  const mcqStreak        = getStudentMcqStreak(studentId);
  const weeklySummary    = buildWeeklyStudentSummary(studentId);
  const topicScores  = latestAssessment ? JSON.parse(latestAssessment.topic_scores || '{}') : {};
  const weakTopics   = latestAssessment ? JSON.parse(latestAssessment.weak_topics   || '[]') : [];
  const strongTopics = latestAssessment ? JSON.parse(latestAssessment.strong_topics || '[]') : [];
  const recentMcqs   = getRecentStudentMcqs(studentId);
  const payload = {
    student, latestAssessment, latestTimetable, assessmentHistory: assessments,
    latestScore: Number(latestAssessment?.score) || 0,
    latestTotal: Number(latestAssessment?.total) || 0,
    attendance: monthAttendance,
    totalAttendance: { total: monthAttendance.total },
    attendanceSummary: { month: monthAttendance, overall: overallAttendance },
    topicScores, weakTopics, strongTopics, weeklySummary, recentMcqs,
    dailyMcqSet, questionPapers, weeklyTests, feeSummary, mcqStreak
  };
  res.json({ student, report: payload, ...payload });
});

app.post('/api/parent/ai-report', authParent, async (req, res) => {
  const { studentId } = req.parent;
  if (!studentId) return res.status(404).json({ error: 'No student linked' });
  const student    = db.prepare('SELECT name, class FROM students WHERE id=?').get(studentId);
  const latest     = db.prepare('SELECT * FROM assessments WHERE student_id=? ORDER BY taken_at DESC LIMIT 1').get(studentId);
  const prev       = db.prepare('SELECT score, total FROM assessments WHERE student_id=? ORDER BY taken_at DESC LIMIT 1 OFFSET 1').get(studentId);
  const thisMonth  = getCurrentMonthPrefix();
  const present    = db.prepare("SELECT COUNT(*) as n FROM attendance WHERE student_id=? AND date LIKE ? AND status='present'").get(studentId, thisMonth + '%');
  const totalDays  = db.prepare('SELECT COUNT(*) as n FROM attendance WHERE student_id=? AND date LIKE ?').get(studentId, thisMonth + '%');
  const score      = latest ? Math.round(latest.score / latest.total * 100) : 0;
  const prevScore  = prev   ? Math.round(prev.score   / prev.total   * 100) : 0;
  const weak       = latest ? JSON.parse(latest.weak_topics   || '[]') : [];
  const strong     = latest ? JSON.parse(latest.strong_topics || '[]') : [];
  const topics     = latest ? JSON.parse(latest.topic_scores  || '{}') : {};
  const fallbackReport = {
    overallSummary: `${student?.name || 'Student'} is at ${score}% this week with attendance ${present.n}/${totalDays.n || 24}. ${OPENAI_API_KEY ? 'AI report unavailable.' : 'AI not configured — showing summary report.'}`,
    highlights: [
      strong.length ? 'Strong topics: ' + strong.join(', ') : 'No strong-topic data yet.',
      prev ? `Previous score was ${prevScore}% and the latest is ${score}%.` : 'This is the first recorded assessment.'
    ],
    concerns: [weak.length ? 'Needs extra attention in: ' + weak.join(', ') + '.' : 'No major weak topics identified.'],
    parentTips: ['Ask your child to revise one weak topic for 20-30 minutes daily.', 'Review attendance and weekly test performance together at the end of each week.'],
    nextWeekFocus: weak.length ? `Focus first on ${weak[0]} and keep practicing the recent test topics.` : 'Maintain consistency with revision, attendance, and daily practice.'
  };
  if (!OPENAI_API_KEY) return res.json({ success: true, student, data: { score, prevScore, attendance: { present: present.n, total: totalDays.n || 24 }, topics, weak, strong }, aiReport: fallbackReport });
  try {
    const prompt = `Write a warm, clear weekly Maths progress report for a parent (no jargon).
Student: ${student?.name || 'Student'}, Class ${student?.class || '?'}.
This week data:
- Attendance: ${present.n}/${totalDays.n || 24} days
- Latest test: ${score}% (previous week: ${prevScore}%)
- Strong topics: ${strong.join(', ') || 'none yet'}
- Weak topics needing focus: ${weak.join(', ') || 'none'}
- Topic-wise scores: ${Object.entries(topics).map(([t,s]) => t+': '+s+'%').join(', ') || 'not available'}
Return ONLY JSON (no markdown, no extra text):
{
  "overallSummary": "2-3 warm encouraging sentences",
  "highlights": ["specific positive point 1", "specific positive point 2"],
  "concerns": ["one specific kindly-worded concern if needed"],
  "parentTips": ["actionable tip 1", "tip 2"],
  "nextWeekFocus": "one clear sentence about what to work on next week"
}`;
    const raw = (await callOpenAI(prompt, { model: 'gpt-4o-mini', maxOutputTokens: 900 })).replace(/```json|```/g, '').trim();
    res.json({ success: true, student, data: { score, prevScore, attendance: { present: present.n, total: totalDays.n || 24 }, topics, weak, strong }, aiReport: JSON.parse(raw) });
  } catch (err) {
    console.error('AI report error:', err.message);
    res.json({ success: true, student, data: { score, prevScore, attendance: { present: present.n, total: totalDays.n || 24 }, topics, weak, strong }, aiReport: fallbackReport });
  }
});

app.get('/api/parent/daily-mcqs', authParent, (req, res) => {
  const { studentId } = req.parent;
  if (!studentId) return res.status(404).json({ error: 'No student linked to this parent account' });
  const student = db.prepare('SELECT id, class, subject, board FROM students WHERE id=?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const set = getStudentActiveMcqSet(student.id, student.class || '', student.subject || '', student.board || '');
  res.json({ batchTitle: set.batchTitle, availableUntil: set.availableUntil, mcqs: set.questions });
});

app.get('/api/parent/question-papers', authParent, (req, res) => {
  const { studentId } = req.parent;
  if (!studentId) return res.status(404).json({ error: 'No student linked to this parent account' });
  const student = db.prepare('SELECT id, class, subject, board FROM students WHERE id=?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json({ papers: getStudentQuestionPapers(student.class || '', student.subject || '', student.board || '') });
});

// ============================================================
//  ASSESSMENT ROUTES
// ============================================================
app.post('/api/assessment/submit', authStudent, (req, res) => {
  const { answers, questions, cls } = req.body;
  if (!answers || !questions || !questions.length) return res.status(400).json({ error: 'Answers and questions are required' });
  const topicScores = {};
  questions.forEach((q, i) => {
    if (!topicScores[q.topic]) topicScores[q.topic] = { correct: 0, total: 0 };
    topicScores[q.topic].total++;
    if (answers[i] === q.ans) topicScores[q.topic].correct++;
  });
  const correct      = questions.filter((q, i) => answers[i] === q.ans).length;
  const total        = questions.length;
  const weakTopics   = Object.entries(topicScores).filter(([, s]) => s.correct / s.total < 0.6).map(([t]) => t);
  const strongTopics = Object.entries(topicScores).filter(([, s]) => s.correct / s.total >= 0.8).map(([t]) => t);
  const topicPcts    = {};
  Object.entries(topicScores).forEach(([t, s]) => { topicPcts[t] = Math.round(s.correct / s.total * 100); });
  db.prepare('INSERT INTO assessments (student_id, class, score, total, topic_scores, weak_topics, strong_topics) VALUES (?,?,?,?,?,?,?)').run(req.student.id, cls || req.student.class, correct, total, JSON.stringify(topicPcts), JSON.stringify(weakTopics), JSON.stringify(strongTopics));
  res.json({ success: true, score: correct, total, pct: Math.round(correct / total * 100), topicScores: topicPcts, weakTopics, strongTopics });
});

app.get('/api/assessment/history', authStudent, (req, res) => {
  const history = db.prepare('SELECT id, class, score, total, topic_scores, weak_topics, strong_topics, taken_at FROM assessments WHERE student_id=? ORDER BY taken_at DESC LIMIT 10').all(req.student.id);
  res.json({ history });
});

app.post('/api/student/weak-topics/test', authStudent, async (req, res) => {
  try {
    const student = db.prepare('SELECT id, class, subject, board FROM students WHERE id=?').get(req.student.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const latestAssessment = db.prepare('SELECT * FROM assessments WHERE student_id=? ORDER BY taken_at DESC LIMIT 1').get(req.student.id);
    const topicScores = latestAssessment?.topic_scores ? JSON.parse(latestAssessment.topic_scores || '{}') : {};
    const weakTopics = latestAssessment?.weak_topics ? JSON.parse(latestAssessment.weak_topics || '[]') : [];
    const requestedTopic = String(req.body?.focusTopic || '').trim();
    const previousQuestions = Array.isArray(req.body?.previousQuestions) ? req.body.previousQuestions : [];
    const starterMode = !latestAssessment;
    let focusTopic = requestedTopic;
    const boardInfo = getBoardMathTopics(student.class || req.student.class, student.board || 'state', student.subject || req.student.subject);
    const starterTopics = (boardInfo.topics || []).slice(0, Math.max(QUESTIONS_PER_TEST || 5, 5));

    if (!starterMode && !focusTopic) {
      const rankedWeakTopics = Object.entries(topicScores)
        .sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0))
        .map(([topic]) => topic)
        .filter((topic) => !weakTopics.length || weakTopics.includes(topic));
      focusTopic = rankedWeakTopics[0] || weakTopics[0] || '';
    }

    if (!starterMode && !focusTopic) {
      focusTopic = starterTopics[0] || '';
    }

    const result = await callGeminiForWeakTopicTest({
      classScope: student.class || req.student.class,
      subjectScope: student.subject || req.student.subject,
      boardScope: student.board || 'state',
      topic: focusTopic,
      focusTopics: starterMode ? starterTopics : [],
      questionCount: 5,
      previousQuestions,
      starterMode
    });

    const generated = result.parsed;
    const questions = Array.isArray(generated) ? generated : (Array.isArray(generated?.questions) ? generated.questions : []);
    if (questions.length !== 5) {
      return res.status(502).json({ error: `Gemini returned ${questions.length || 0} questions instead of 5. Please try again.` });
    }

    res.json({
      success: true,
      ready: true,
      starterMode,
      modelUsed: result.modelUsed,
      focusTopic: starterMode ? '' : focusTopic,
      suggestedTopics: starterMode ? starterTopics : [],
      weakTopics,
      topicScores,
      questions: questions.map((item, index) => sanitizeGeneratedMcq(item, index))
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not generate weak-topic test.' });
  }
});

// ============================================================
//  AI CHATBOT
// ============================================================
app.post('/api/chat/message', async (req, res) => {
  const { message, sessionKey, studentId } = req.body;
  const student = studentId ? db.prepare('SELECT id, name, class, board FROM students WHERE id=?').get(studentId) : null;
  if (!message?.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  const mathKeywords = ['solve','find','calculate','prove','simplify','integrate','differentiate','derivative','equation','formula','theorem','matrix','vector','probability','function','graph','limit','angle','triangle','circle','polynomial','factor','expand','evaluate','roots','area','volume','perimeter','slope','sin','cos','tan','log','algebra','geometry','trigonometry','calculus','statistics','arithmetic','fraction','decimal','number','sequence','progression','permutation','combination','binomial','complex','determinant','differential','integral','quadratic','linear','coordinate','mensuration','set','relation'];
  const hasDigitsOrSymbols = /[\d\+\-\*\/\=\^\(\)\[\]\{\}]/.test(message);
  const hasMathWord        = mathKeywords.some((k) => message.toLowerCase().includes(k));
  if (!hasDigitsOrSymbols && !hasMathWord)
    return res.json({ reply: 'I am Mathi, your Maths doubt companion. I only answer Maths questions. Try: "Solve x^2 - 5x + 6 = 0" or "Explain integration by parts".', isMathQuestion: false, sessionKey: sessionKey || null });
  const activeSessionKey = sessionKey || ('chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const existing  = db.prepare('SELECT messages FROM chat_sessions WHERE session_key=?').get(activeSessionKey);
  const history   = existing ? JSON.parse(existing.messages || '[]') : [];
  const context   = history.slice(-8).map((e) => (e.role === 'assistant' ? 'Tutor' : 'Student') + ': ' + e.content).join('\n');
  try {
    const reply = OPENAI_API_KEY
      ? await callOpenAI('Student question: ' + message + '\n\nRecent conversation:\n' + (context || 'No previous conversation.'),
          { system: 'You are Mathi, a friendly Maths tutor for school students in India. Explain clearly, keep steps accurate, and stay focused on Maths only.', model: 'gpt-4o-mini', maxOutputTokens: 900 })
      : buildMathiDemoReply(message, student || {});
    const updatedMessages = history.concat([
      { role: 'user', content: message, at: new Date().toISOString(), studentId: studentId || null },
      { role: 'assistant', content: reply, at: new Date().toISOString() }
    ]);
    db.prepare(`
      INSERT INTO chat_sessions (student_id, session_key, messages, updated_at)
      VALUES (?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT (session_key)
      DO UPDATE SET student_id=EXCLUDED.student_id, messages=EXCLUDED.messages, updated_at=CURRENT_TIMESTAMP
    `).run(studentId || null, activeSessionKey, JSON.stringify(updatedMessages));
    res.json({ reply, isMathQuestion: true, sessionKey: activeSessionKey });
  } catch (err) {
    console.error('Chat error:', err.message);
    const reply = buildMathiDemoReply(message, student || {});
    res.json({ reply, isMathQuestion: true, sessionKey: activeSessionKey, demoMode: true });
  }
});

app.get('/api/chat/history/:sessionKey', (req, res) => {
  const session = db.prepare('SELECT messages FROM chat_sessions WHERE session_key=?').get(req.params.sessionKey);
  res.json({ messages: session ? JSON.parse(session.messages) : [] });
});

// ============================================================
//  DOUBT ROUTES
// ============================================================
app.post('/api/student/doubts', authStudent, (req, res) => {
  const { questionText, questionImage } = req.body || {};
  if (!questionText || !String(questionText).trim()) return res.status(400).json({ error: 'Please enter your doubt/question.' });
  db.prepare('INSERT INTO doubts (student_id, question_text, question_image, status) VALUES (?,?,?,?)').run(req.student.id, String(questionText).trim(), questionImage || null, 'open');
  res.json({ success: true });
});

app.get('/api/student/doubts', authStudent, (req, res) => {
  const rows = db.prepare('SELECT id, question_text, question_image, answer_text, answer_image, status, created_at, answered_at FROM doubts WHERE student_id=? ORDER BY created_at DESC LIMIT 20').all(req.student.id);
  res.json({ doubts: rows });
});

app.get('/api/teacher/doubts', authTeacher, (req, res) => {
  const rows = db.prepare(`
    SELECT d.id, d.question_text, d.question_image, d.answer_text, d.answer_image, d.status,
           d.created_at, d.answered_at, s.name AS student_name, s.class AS student_class
    FROM doubts d JOIN students s ON s.id = d.student_id
    ORDER BY CASE WHEN d.status='open' THEN 0 ELSE 1 END, d.created_at DESC
  `).all();
  res.json({ doubts: rows });
});

app.post('/api/teacher/doubts/:id/answer', authTeacher, (req, res) => {
  const { answerText, answerImage } = req.body || {};
  const doubtId = Number(req.params.id || 0);
  if (!doubtId || !answerText || !String(answerText).trim()) return res.status(400).json({ error: 'Please enter an answer.' });
  db.prepare("UPDATE doubts SET answer_text=?, answer_image=?, status='answered', teacher_id=?, answered_at=CURRENT_TIMESTAMP WHERE id=?").run(String(answerText).trim(), answerImage || null, req.teacher.id, doubtId);
  res.json({ success: true });
});

// ============================================================
//  TIMETABLE ROUTES
// ============================================================
app.post('/api/timetable/generate', authStudent, async (req, res) => {
  const { availableDays, preferredTime, hoursPerDay, sessionLength, weakTopics, goal, weeksToExam, subject } = req.body;
  const student   = db.prepare('SELECT name, class, subject, board FROM students WHERE id=?').get(req.student.id);
  const boardInfo = getBoardMathTopics(student?.class, student?.board, student?.subject || subject);
  const sanitizedWeakTopics = Array.isArray(weakTopics) ? weakTopics.filter((t) => boardInfo.topics.includes(t)) : [];
  const prompt = `Create a personalised weekly ${boardInfo.subjectName} study timetable.
Student: ${student.name}, Class ${student.class}. Goal: ${goal || 'Board Exams'}. Weeks to exam: ${weeksToExam || 8}.
Available days: ${(availableDays || ['Mon','Tue','Wed','Thu','Fri']).join(', ')}.
Preferred study time: ${preferredTime || 'Evening (4-8 PM)'}. Daily hours: ${hoursPerDay || 2}. Session length: ${sessionLength || '45 min'}.
Allowed chapter list: ${boardInfo.topics.join(', ')}. Weak topics needing extra sessions: ${sanitizedWeakTopics.join(', ') || 'none specified'}.
Return ONLY valid JSON (no markdown):
{
  "summary": "2-line personalised summary",
  "weeklyPlan": {
    "Mon": [{"time":"9:00 AM","topic":"Algebra","type":"study","duration":"45 min"}],
    "Tue": [], "Wed": [], "Thu": [], "Fri": [], "Sat": [], "Sun": []
  },
  "weakFocus": [{"topic":"TopicName","extraSessions":2,"reason":"why"}],
  "tips": ["tip 1","tip 2","tip 3"]
}
Slot types: "study"|"practice"|"revision"|"test"|"doubt". Prioritise weak topics with 2-3x more sessions.`;
  try {
    const schedule = OPENAI_API_KEY
      ? JSON.parse((await callOpenAI(prompt, { model: 'gpt-4o-mini', maxOutputTokens: 2200 })).replace(/```json|```/g, '').trim())
      : buildDemoTimetable(student, { availableDays, preferredTime, hoursPerDay, sessionLength, weakTopics: sanitizedWeakTopics, goal, weeksToExam, subject: boardInfo.subject });
    const result = db.prepare('INSERT INTO timetables (student_id, schedule, weak_topics) VALUES (?,?,?)').run(req.student.id, JSON.stringify(schedule), JSON.stringify(sanitizedWeakTopics));
    res.json({ success: true, timetable: { id: result.lastInsertRowid, student_id: req.student.id, schedule, weak_topics: JSON.stringify(sanitizedWeakTopics) }, schedule });
  } catch (err) {
    console.error('Timetable error:', err.message);
    const schedule = buildDemoTimetable(student, { availableDays, preferredTime, hoursPerDay, sessionLength, weakTopics: sanitizedWeakTopics, goal, weeksToExam, subject: boardInfo.subject });
    const result   = db.prepare('INSERT INTO timetables (student_id, schedule, weak_topics) VALUES (?,?,?)').run(req.student.id, JSON.stringify(schedule), JSON.stringify(sanitizedWeakTopics));
    res.json({ success: true, timetable: { id: result.lastInsertRowid, student_id: req.student.id, schedule, weak_topics: JSON.stringify(sanitizedWeakTopics) }, schedule, demoMode: true });
  }
});

app.get('/api/timetable/latest', authStudent, (req, res) => {
  const t = db.prepare('SELECT * FROM timetables WHERE student_id=? ORDER BY created_at DESC LIMIT 1').get(req.student.id);
  if (!t) return res.json({ timetable: null });
  const schedule = JSON.parse(t.schedule);
  res.json({ timetable: { ...t, schedule, completionMap: buildTimetableCompletionMap(t.id, req.student.id) } });
});

app.post('/api/timetable/slot-completion', authStudent, (req, res) => {
  const { timetableId, day, time, topic, completed } = req.body;
  if (!timetableId || !day || !time || !topic) return res.status(400).json({ error: 'timetableId, day, time and topic are required' });
  db.prepare(`
    INSERT INTO timetable_completions (timetable_id, student_id, slot_day, slot_time, topic, completed, updated_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT (timetable_id, student_id, slot_day, slot_time, topic)
    DO UPDATE SET completed=EXCLUDED.completed, updated_at=CURRENT_TIMESTAMP
  `).run(timetableId, req.student.id, day, time, topic, completed ? 1 : 0);
  res.json({ success: true, completed: !!completed });
});

// ============================================================
//  MCQ & PAPERS — STUDENT
// ============================================================
app.get('/api/student/daily-mcqs', authStudent, (req, res) => {
  const student = db.prepare('SELECT id, class, subject, board FROM students WHERE id=?').get(req.student.id);
  const set     = getStudentActiveMcqSet(req.student.id, student?.class || '', student?.subject || '', student?.board || '');
  res.json({ batchTitle: set.batchTitle, availableUntil: set.availableUntil, mcqs: set.questions });
});

app.get('/api/student/question-papers', authStudent, (req, res) => {
  const student = db.prepare('SELECT id, class, subject, board FROM students WHERE id=?').get(req.student.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json({ papers: getStudentQuestionPapers(student.class || '', student.subject || '', student.board || '') });
});

app.post('/api/student/daily-mcqs/:id/submit', authStudent, (req, res) => {
  const mcqId         = Number(req.params.id);
  const selectedIndex = Number(req.body.selectedIndex);
  const mcq = db.prepare('SELECT id, correct_index FROM daily_mcqs WHERE id=? AND active=1 AND (available_until IS NULL OR available_until >= CURRENT_TIMESTAMP)').get(mcqId);
  if (!mcq) return res.status(404).json({ error: 'MCQ not found or expired' });
  const isCorrect = selectedIndex === Number(mcq.correct_index) ? 1 : 0;
  db.prepare(`
    INSERT INTO daily_mcq_submissions (mcq_id, student_id, selected_index, is_correct, submitted_at)
    VALUES (?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT (mcq_id, student_id)
    DO UPDATE SET selected_index=EXCLUDED.selected_index, is_correct=EXCLUDED.is_correct, submitted_at=CURRENT_TIMESTAMP
  `).run(mcqId, req.student.id, selectedIndex, isCorrect);
  res.json({ success: true, isCorrect: !!isCorrect });
});

// ============================================================
//  MCQ & PAPERS — TEACHER
// ============================================================
app.get('/api/teacher/mcqs', authTeacher, (req, res) => {
  try {
    const mcqRows = db.prepare(`
      SELECT COALESCE(m.batch_title, m.title) AS batch_title,
             MIN(m.title) AS title, m.class_scope, COALESCE(m.subject_scope, 'all') AS subject_scope, COALESCE(m.board_scope, 'all') AS board_scope,
             MAX(m.available_until) AS available_until,
             MAX(m.created_at) AS created_at,
             COUNT(DISTINCT m.id) AS question_count,
             COUNT(s.id) AS submission_count,
             SUM(CASE WHEN s.is_correct=1 THEN 1 ELSE 0 END) AS correct_count
      FROM daily_mcqs m
      LEFT JOIN daily_mcq_submissions s ON s.mcq_id = m.id
      GROUP BY COALESCE(m.batch_title, m.title), m.class_scope, COALESCE(m.subject_scope, 'all'), COALESCE(m.board_scope, 'all')
      ORDER BY MAX(m.created_at) DESC
      LIMIT 20
    `).all();

    const allStudents = db.prepare(`
      SELECT id, name, email, class, subject, board
      FROM students
      WHERE COALESCE(approval_status, 'accepted') <> 'rejected'
      ORDER BY class, name
    `).all();

    const allSubmissionStats = db.prepare(`
      SELECT s.student_id,
             COALESCE(m.batch_title, m.title) AS batch_title,
             m.class_scope, COALESCE(m.subject_scope, 'all') AS subject_scope, COALESCE(m.board_scope, 'all') AS board_scope, s.is_correct
      FROM daily_mcq_submissions s
      JOIN daily_mcqs m ON m.id = s.mcq_id
    `).all();

    const submissionMap = new Map();
    allSubmissionStats.forEach((row) => {
      const key = `${row.batch_title}__${row.class_scope || 'all'}__${row.subject_scope || 'all'}__${row.board_scope || 'all'}__${row.student_id}`;
      const current = submissionMap.get(key) || { attempted: 0, correct: 0 };
      current.attempted += 1;
      current.correct   += Number(row.is_correct) === 1 ? 1 : 0;
      submissionMap.set(key, current);
    });

    const mcqs = mcqRows.map((mcq) => {
      const classScope    = mcq.class_scope || 'all';
      const subjectScope  = mcq.subject_scope || 'all';
      const boardScope    = mcq.board_scope || 'all';
      const questionCount = Number(mcq.question_count || 0);
      const eligibleStudents = classScope === 'all'
        ? allStudents
        : allStudents.filter((s) => {
            if (String(s.class || '') !== String(classScope)) return false;
            if ((String(classScope) === '11' || String(classScope) === '12') && subjectScope !== 'all') {
              if (normalizeStudentSubject(s.subject, s.class) !== subjectScope) return false;
            }
            if (boardScope !== 'all' && normalizeBoardScope(s.board) !== boardScope) return false;
            return true;
          });

      const studentStats = eligibleStudents.map((student) => {
        const statKey   = `${mcq.batch_title}__${classScope}__${subjectScope}__${boardScope}__${student.id}`;
        const stat      = submissionMap.get(statKey) || { attempted: 0, correct: 0 };
        const attempted = Number(stat.attempted || 0);
        const correct   = Number(stat.correct   || 0);
        return {
          id: student.id, name: student.name, email: student.email, class: student.class,
          attemptedCount: attempted,
          notAttemptedCount: Math.max(questionCount - attempted, 0),
          correctCount: correct,
          wrongCount: Math.max(attempted - correct, 0),
          score: `${correct}/${questionCount}`,
          status: attempted > 0 ? 'attempted' : 'not-attempted'
        };
      });

      return {
        ...mcq, question_count: questionCount, subject_scope: subjectScope, board_scope: boardScope, student_reports: studentStats,
        attempted_students:     studentStats.filter((s) => s.attemptedCount > 0).length,
        not_attempted_students: studentStats.filter((s) => s.attemptedCount === 0).length
      };
    });

    res.json({ mcqs });
  } catch (err) {
    console.error('[GET /api/teacher/mcqs]', err.message);
    res.status(500).json({ error: 'Could not load MCQs: ' + err.message });
  }
});

app.post('/api/teacher/mcqs/generate', authTeacher, async (req, res) => {
  try {
    const { classScope, subjectScope, boardScope, topic, difficulty, questionCount } = req.body || {};
    const safeCount = Math.max(1, Math.min(20, Number(questionCount) || 0));
    if (!safeCount) return res.status(400).json({ error: 'Please choose how many MCQs to generate.' });
    if (!String(topic || '').trim()) return res.status(400).json({ error: 'Topic is required for AI MCQ generation.' });
    if ((String(classScope) === '11' || String(classScope) === '12') && !String(subjectScope || '').trim()) {
      return res.status(400).json({ error: 'Please choose Maths or Business Maths for Class 11/12.' });
    }
    const result = await callGeminiForMcqs({
      classScope: classScope || 'all',
      subjectScope: subjectScope || 'maths',
      boardScope: boardScope || 'all',
      topic: String(topic || '').trim(),
      difficulty: String(difficulty || 'medium').trim(),
      questionCount: safeCount
    });
    const generated = result.parsed;
    const questions = Array.isArray(generated) ? generated : (Array.isArray(generated?.questions) ? generated.questions : []);
    if (questions.length !== safeCount) {
      return res.status(502).json({ error: `Gemini returned ${questions.length || 0} questions instead of ${safeCount}. Please try again.` });
    }
    res.json({
      success: true,
      modelUsed: result.modelUsed,
      questions: questions.map((item, index) => sanitizeGeneratedMcq(item, index))
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not generate MCQs with Gemini.' });
  }
});

app.post('/api/teacher/mcqs/regenerate', authTeacher, async (req, res) => {
  try {
    const { classScope, subjectScope, boardScope, topic, difficulty, questionIndex, questions } = req.body || {};
    const safeIndex = Number(questionIndex);
    if (!Number.isInteger(safeIndex) || safeIndex < 0) return res.status(400).json({ error: 'A valid question index is required.' });
    if (!String(topic || '').trim()) return res.status(400).json({ error: 'Topic is required for AI regeneration.' });
    const result = await callGeminiForMcqs({
      classScope: classScope || 'all',
      subjectScope: subjectScope || 'maths',
      boardScope: boardScope || 'all',
      topic: String(topic || '').trim(),
      difficulty: String(difficulty || 'medium').trim(),
      questionCount: 1,
      questionIndex: safeIndex,
      questions: Array.isArray(questions) ? questions : []
    });
    const generated = result.parsed;
    const question = sanitizeGeneratedMcq(Array.isArray(generated) ? generated[0] : (generated?.question || generated), safeIndex);
    res.json({ success: true, modelUsed: result.modelUsed, question });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not regenerate this MCQ.' });
  }
});

app.post('/api/teacher/mcqs', authTeacher, (req, res) => {
  const { title, classScope, subjectScope, boardScope, questions } = req.body;
  if (!Array.isArray(questions) || !questions.length || questions.length > 20)
    return res.status(400).json({ error: 'Please provide between 1 and 20 MCQs for the batch.' });
  const batchTitle    = (title || 'Daily MCQ Batch').trim() || 'Daily MCQ Batch';
  const normalizedSubjectScope = (String(classScope) === '11' || String(classScope) === '12')
    ? normalizeStudentSubject(subjectScope || 'maths', classScope)
    : 'all';
  const normalizedBoardScope = classScope === 'all' ? 'all' : normalizeBoardScope(boardScope || 'state');
  const availableUntil = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
  const insert = db.prepare('INSERT INTO daily_mcqs (teacher_id, title, batch_title, question_no, question, question_image, options, correct_index, class_scope, subject_scope, board_scope, available_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const transaction = db.transaction((items) => {
    items.forEach((item, index) => {
      const options      = Array.isArray(item.options) ? item.options.filter(Boolean) : [];
      const questionText = String(item.question  || '').trim();
      const questionImage= String(item.imageUrl  || '').trim();
      if ((!questionText && !questionImage) || options.length < 2)
        throw new Error('Each filled MCQ card must have question text or image, plus at least 2 options.');
      const correctIndex = Number(item.correctIndex);
      if (correctIndex < 0 || correctIndex >= options.length)
        throw new Error('Each MCQ needs a valid correct option.');
      insert.run(req.teacher.id, batchTitle, batchTitle, index + 1, questionText || null, questionImage || null, JSON.stringify(options), correctIndex, classScope || 'all', normalizedSubjectScope, normalizedBoardScope, availableUntil);
    });
  });
  try { transaction(questions); res.json({ success: true, batchTitle, availableUntil }); }
  catch (err) { res.status(400).json({ error: err.message || 'Could not create MCQ batch.' }); }
});

app.get('/api/teacher/question-papers', authTeacher, (req, res) => {
  const papers = db.prepare('SELECT * FROM question_papers ORDER BY posted_at DESC LIMIT 20').all();
  res.json({ papers });
});

app.post('/api/teacher/question-papers', authTeacher, (req, res) => {
  const { title, classScope, subjectScope, boardScope, resourceType, resourceUrl } = req.body;
  if (!title || !resourceUrl) return res.status(400).json({ error: 'Title and document link/path are required.' });
  const normalizedSubjectScope = (String(classScope) === '11' || String(classScope) === '12')
    ? normalizeStudentSubject(subjectScope || 'maths', classScope)
    : 'all';
  const normalizedBoardScope = classScope === 'all' ? 'all' : normalizeBoardScope(boardScope || 'state');
  const result = db.prepare('INSERT INTO question_papers (teacher_id, title, class_scope, subject_scope, board_scope, resource_type, resource_url) VALUES (?,?,?,?,?,?,?)').run(req.teacher.id, title.trim(), classScope || 'all', normalizedSubjectScope, normalizedBoardScope, resourceType || 'pdf', resourceUrl.trim());
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/teacher/question-papers/:id', authTeacher, (req, res) => {
  const paperId = Number(req.params.id);
  if (!paperId) return res.status(400).json({ error: 'Valid question paper id is required.' });
  const existing = db.prepare('SELECT id FROM question_papers WHERE id=?').get(paperId);
  if (!existing) return res.status(404).json({ error: 'Question paper not found.' });
  db.prepare('DELETE FROM question_papers WHERE id=?').run(paperId);
  res.json({ success: true, deletedId: paperId });
});

// ============================================================
//  WEEKLY TESTS & FEES — TEACHER
// ============================================================
app.get('/api/teacher/weekly-tests', authTeacher, (req, res) => {
  const tests = db.prepare(`
    SELECT wt.title, wt.test_date, s.name AS student_name, s.class,
           wt.marks_obtained, wt.total_marks, wt.notes
    FROM weekly_tests wt JOIN students s ON s.id = wt.student_id
    WHERE COALESCE(s.approval_status, 'accepted') <> 'rejected'
    ORDER BY wt.test_date DESC, wt.created_at DESC LIMIT 50
  `).all();
  res.json({ tests });
});

app.post('/api/teacher/weekly-tests', authTeacher, (req, res) => {
  const { title, testDate, totalMarks, entries } = req.body;
  if (!title || !testDate || !Array.isArray(entries))
    return res.status(400).json({ error: 'Title, test date, and student entries are required.' });
  const insert = db.prepare('INSERT INTO weekly_tests (teacher_id, student_id, title, test_date, marks_obtained, total_marks, notes) VALUES (?,?,?,?,?,?,?)');
  const activeStudentIds = new Set(
    db.prepare("SELECT id FROM students WHERE COALESCE(approval_status, 'accepted') <> 'rejected'").all().map((row) => Number(row.id))
  );
  const transaction = db.transaction((rows) => {
    rows.forEach((row) => {
      const studentId = Number(row.studentId);
      const marks     = row.marksObtained;
      if (!studentId || !activeStudentIds.has(studentId) || marks === '' || marks === null || marks === undefined) return;
      insert.run(req.teacher.id, studentId, title.trim(), testDate, Number(marks) || 0, Number(totalMarks) || 100, (row.notes || '').trim());
    });
  });
  transaction(entries);
  res.json({ success: true, students: buildTeacherStudentsSnapshot() });
});

app.post('/api/teacher/fees', authTeacher, (req, res) => {
  const { paidOn, entries } = req.body;
  if (!paidOn || !Array.isArray(entries))
    return res.status(400).json({ error: 'Payment date and student fee entries are required.' });
  const insert = db.prepare('INSERT INTO fee_payments (teacher_id, student_id, amount_paid, paid_on) VALUES (?,?,?,?)');
  const activeStudentIds = new Set(
    db.prepare("SELECT id FROM students WHERE COALESCE(approval_status, 'accepted') <> 'rejected'").all().map((row) => Number(row.id))
  );
  const transaction = db.transaction((rows) => {
    rows.forEach((row) => {
      const studentId = Number(row.studentId);
      const amountPaid = Number(row.amountPaid);
      if (!studentId || !activeStudentIds.has(studentId) || !amountPaid) return;
      insert.run(req.teacher.id, studentId, amountPaid, paidOn);
    });
  });
  transaction(entries);
  res.json({ success: true, students: buildTeacherStudentsSnapshot() });
});

// ============================================================
//  TEACHER STUDENTS & ATTENDANCE
// ============================================================
app.get('/api/teacher/students', authTeacher, (req, res) => {
  try {
    const selectedDate = String(req.query.date || '').trim();
    res.json({
      teacher: { id: req.teacher.id, name: req.teacher.name, email: req.teacher.email },
      selectedDate: selectedDate || null,
      students: buildTeacherStudentsSnapshot(selectedDate)
    });
  } catch (error) {
    console.error('[GET /api/teacher/students]', error.message);
    res.status(500).json({ error: 'Could not load teacher dashboard data: ' + (error.message || 'Unknown error') });
  }
});

app.post('/api/teacher/attendance', authTeacher, (req, res) => {
  const { date, attendance } = req.body;
  if (!date || !Array.isArray(attendance)) return res.status(400).json({ error: 'Date and attendance rows are required' });
  const upsert = db.prepare(
    'INSERT INTO attendance (student_id, date, status) VALUES (?,?,?) ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status'
  );
  const updateApproval = db.prepare('UPDATE students SET approval_status=? WHERE id=?');
  const activeStudentIds = new Set(
    db.prepare("SELECT id FROM students WHERE COALESCE(approval_status, 'accepted') <> 'rejected'").all().map((row) => Number(row.id))
  );
  const transaction = db.transaction((rows) => {
    for (const row of rows) {
      const studentId      = Number(row.studentId);
      const status         = String(row.status         || '').toLowerCase();
      const approvalStatus = String(row.approvalStatus || 'accepted').toLowerCase();
      if (!studentId || !['present','absent'].includes(status)) continue;
      const isRejectingNow = approvalStatus === 'rejected';
      if (!activeStudentIds.has(studentId) && !isRejectingNow) continue;
      upsert.run(studentId, date, status);
      if (['accepted','rejected'].includes(approvalStatus)) updateApproval.run(approvalStatus, studentId);
    }
  });
  transaction(attendance);
  res.json({
    success: true,
    updated: attendance.length,
    students: buildTeacherStudentsSnapshot(date)
  });
});

app.post('/api/attendance/mark', authTeacher, (req, res) => {
  const { studentId, date, status } = req.body;
  if (!studentId || !date) return res.status(400).json({ error: 'studentId and date required' });
  db.prepare('INSERT INTO attendance (student_id, date, status) VALUES (?,?,?) ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status').run(studentId, date, status || 'present');
  res.json({ success: true });
});

app.get('/api/attendance/:studentId', authStudent, (req, res) => {
  const records = db.prepare('SELECT date, status FROM attendance WHERE student_id=? ORDER BY date DESC LIMIT 60').all(req.params.studentId);
  res.json({ records });
});

// ============================================================
//  HEALTH & DEBUG
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), service: 'I LEARN Academy API', database: USING_POSTGRES ? 'postgresql' : 'sqlite' });
});

app.get('/api/debug/students-count', (req, res) => {
  try {
    const totalStudents  = db.prepare('SELECT COUNT(*) AS count FROM students').get()?.count || 0;
    const latestStudents = db.prepare('SELECT id, name, email, class, created_at FROM students ORDER BY id DESC LIMIT 10').all();
    res.json({ status: 'ok', database: USING_POSTGRES ? 'postgresql' : 'sqlite', totalStudents, latestStudents });
  } catch (err) { res.status(500).json({ status: 'error', error: err.message }); }
});

app.get('/api/debug/teacher-students', (req, res) => {
  try {
    const selectedDate = String(req.query.date || '').trim();
    const students     = db.prepare(`
      SELECT id, name, email, class, subject, approval_status, mobile, board, created_at
      FROM students
      WHERE COALESCE(approval_status, 'accepted') <> 'rejected'
      ORDER BY class, name
    `).all();
    const attendanceByStudent = db.prepare("SELECT student_id, SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS presentCount, COUNT(*) AS totalCount FROM attendance GROUP BY student_id").all();
    const attendanceMap = new Map(attendanceByStudent.map((row) => [row.student_id, row]));
    const attendanceForDate = selectedDate ? db.prepare('SELECT student_id, status FROM attendance WHERE date=?').all(selectedDate) : [];
    const statusMap   = new Map(attendanceForDate.map((row) => [row.student_id, row.status]));
    const feePayments = db.prepare('SELECT student_id, amount_paid, paid_on, created_at FROM fee_payments ORDER BY paid_on DESC, created_at DESC').all();
    const feePaymentsMap = new Map();
    feePayments.forEach((p) => { const list = feePaymentsMap.get(p.student_id) || []; list.push(p); feePaymentsMap.set(p.student_id, list); });
    const latestWeeklyTests = db.prepare(`
      SELECT student_id, title, test_date, marks_obtained, total_marks
      FROM (SELECT student_id, title, test_date, marks_obtained, total_marks,
                   ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY test_date DESC, created_at DESC) AS row_num
            FROM weekly_tests) t WHERE row_num=1
    `).all();
    const latestWeeklyTestMap = new Map(latestWeeklyTests.map((t) => [t.student_id, t]));
    res.json({
      status: 'ok', selectedDate: selectedDate || null, totalStudents: students.length,
      students: students.map((student) => {
        const stats = attendanceMap.get(student.id) || { presentCount: 0, totalCount: 0 };
        const tc = Number(stats.totalCount) || 0, pc = Number(stats.presentCount) || 0;
        const payments  = feePaymentsMap.get(student.id) || [];
        const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);
        const totalDue  = getClassFeeTarget(student.class);
        return { ...student, approvalStatus: String(student.approval_status || 'accepted').toLowerCase(),
          currentStatus: statusMap.get(student.id) || null,
          attendance:    { present: pc, total: tc, percentage: tc ? Math.round((pc/tc)*1000)/10 : 0 },
          feeSummary:    { totalDue, totalPaid: Math.round(totalPaid*100)/100, pending: Math.max(0,Math.round((totalDue-totalPaid)*100)/100), payments },
          latestWeeklyTest: latestWeeklyTestMap.get(student.id) || null };
      })
    });
  } catch (error) { res.status(500).json({ status: 'error', error: error.message || 'Could not build teacher student snapshot.' }); }
});

// ── IMPORTANT: Catch-all for unknown /api/* routes → return JSON not HTML ──
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found: ' + req.path });
});

// ============================================================
//  START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║    I LEARN ACADEMY — Backend Server       ║
║    http://localhost:${PORT}                  ║
╠═══════════════════════════════════════════╣
║  Database:    ${USING_POSTGRES ? 'PostgreSQL' : 'SQLite    '}                  ║
╚═══════════════════════════════════════════╝

Routes ready:
  POST /api/student/register
  POST /api/student/login
  GET  /api/student/profile
  POST /api/parent/google-login
  GET  /api/parent/report
  POST /api/assessment/submit
  GET  /api/assessment/history
  POST /api/chat/message
  GET  /api/chat/history/:key
  POST /api/timetable/generate
  GET  /api/timetable/latest
  GET  /api/teacher/students
  POST /api/teacher/attendance
  GET  /api/teacher/mcqs
  POST /api/teacher/mcqs
  POST /api/teacher/fees
  POST /api/teacher/weekly-tests
  GET  /api/teacher/doubts
  POST /api/teacher/doubts/:id/answer
  GET  /api/attendance/:id
  GET  /api/health
  `);
});







































