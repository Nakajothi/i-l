require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'ilearn-local-secret';
const DATABASE_URL = process.env.DATABASE_URL || '';
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const APP_BUILD = process.env.APP_BUILD || 'postgres-clean-v2';
const TEACHER_EMAIL = String(process.env.TEACHER_EMAIL || 'ilearntution@gmail.com').trim().toLowerCase();
const TEACHER_PASSWORD = String(process.env.TEACHER_PASSWORD || 'teacher123');
const TEACHER_NAME = String(process.env.TEACHER_NAME || 'I LEARN Staff');

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required. This clean build is PostgreSQL-only.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function one(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

function getMonthPrefix(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || String(date.getFullYear());
  const month = parts.find((part) => part.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getClassFeeTarget(studentClass) {
  switch (String(studentClass || '').trim()) {
    case '9': return 15000;
    case '10': return 10000;
    case '11': return 12000;
    case '12': return 14000;
    default: return 0;
  }
}

function normalizeStudent(student) {
  if (!student) return null;
  return {
    id: Number(student.id),
    name: student.name,
    email: student.email,
    class: String(student.class || '').trim(),
    subject: student.subject || 'maths',
    mobile: student.mobile || '',
    board: student.board || 'state',
    createdAt: student.created_at || null
  };
}

async function buildAttendanceSummary(studentId, monthPrefix = '') {
  const pattern = monthPrefix ? `${monthPrefix}%` : '%';
  const counts = await one(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'present') AS present_count,
      COUNT(*) AS total_count
    FROM attendance
    WHERE student_id = $1 AND date LIKE $2
  `, [studentId, pattern]);

  const present = Number(counts?.present_count || 0);
  const total = Number(counts?.total_count || 0);
  return {
    present,
    total,
    percentage: total ? Math.round((present / total) * 1000) / 10 : 0
  };
}

async function buildFeeSummary(studentId, studentClass) {
  const payments = await all(`
    SELECT amount_paid, paid_on, created_at
    FROM fee_payments
    WHERE student_id = $1
    ORDER BY paid_on DESC, created_at DESC
    LIMIT 20
  `, [studentId]);

  const totalPaid = payments.reduce((sum, payment) => sum + (Number(payment.amount_paid) || 0), 0);
  const totalDue = getClassFeeTarget(studentClass);

  return {
    totalDue,
    totalPaid: Math.round(totalPaid * 100) / 100,
    pending: Math.max(0, Math.round((totalDue - totalPaid) * 100) / 100),
    payments: payments.map((payment) => ({
      amount_paid: Number(payment.amount_paid) || 0,
      paid_on: payment.paid_on,
      created_at: payment.created_at
    }))
  };
}

async function getStudentWeeklyTests(studentId) {
  const tests = await all(`
    SELECT title, test_date, marks_obtained, total_marks, notes, created_at
    FROM weekly_tests
    WHERE student_id = $1
    ORDER BY test_date DESC, created_at DESC
    LIMIT 10
  `, [studentId]);

  return tests.map((test) => ({
    title: test.title,
    test_date: test.test_date,
    marks_obtained: Number(test.marks_obtained) || 0,
    total_marks: Number(test.total_marks) || 0,
    notes: test.notes || '',
    created_at: test.created_at
  }));
}

async function buildAttendanceStreak(studentId) {
  const rows = await all(`
    SELECT date, status
    FROM attendance
    WHERE student_id = $1
    ORDER BY date DESC
    LIMIT 30
  `, [studentId]);

  let streak = 0;
  for (const row of rows) {
    if (row.status !== 'present') break;
    streak += 1;
  }
  return streak;
}

async function buildTeacherStudentsSnapshot(selectedDate = '') {
  const students = await all(`
    SELECT id, name, email, class, subject, mobile, board, created_at
    FROM students
    ORDER BY class, name
  `);

  return Promise.all(students.map(async (student) => {
    const studentId = Number(student.id);
    const attendance = await buildAttendanceSummary(studentId);
    const feeSummary = await buildFeeSummary(studentId, student.class);
    const latestWeeklyTest = await one(`
      SELECT title, test_date, marks_obtained, total_marks, notes
      FROM weekly_tests
      WHERE student_id = $1
      ORDER BY test_date DESC, created_at DESC
      LIMIT 1
    `, [studentId]);

    const currentStatus = selectedDate
      ? (await one('SELECT status FROM attendance WHERE student_id = $1 AND date = $2', [studentId, selectedDate]))?.status || null
      : null;

    return {
      ...normalizeStudent(student),
      currentStatus,
      attendance,
      feeSummary,
      latestWeeklyTest: latestWeeklyTest ? {
        title: latestWeeklyTest.title,
        test_date: latestWeeklyTest.test_date,
        marks_obtained: Number(latestWeeklyTest.marks_obtained) || 0,
        total_marks: Number(latestWeeklyTest.total_marks) || 0,
        notes: latestWeeklyTest.notes || ''
      } : null
    };
  }));
}

function signStudent(student) {
  return jwt.sign(
    { role: 'student', id: Number(student.id), email: student.email, name: student.name, class: student.class },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function signTeacher(teacher) {
  return jwt.sign(
    { role: 'teacher', id: Number(teacher.id), email: teacher.email, name: teacher.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function authStudent(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Student login required.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'student') return res.status(403).json({ error: 'Invalid student session.' });
    const student = await one('SELECT id, name, email, class FROM students WHERE id = $1', [decoded.id]);
    if (!student) return res.status(401).json({ error: 'Student account not found. Please login again.' });
    req.student = normalizeStudent(student);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Session expired. Please login again.' });
  }
}

async function authTeacher(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Teacher login required.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'teacher') return res.status(403).json({ error: 'Invalid teacher session.' });
    const teacher = await one('SELECT id, name, email FROM teachers WHERE id = $1', [decoded.id]);
    if (!teacher) return res.status(401).json({ error: 'Teacher account not found. Please login again.' });
    req.teacher = teacher;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Session expired. Please login again.' });
  }
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      class TEXT NOT NULL,
      subject TEXT DEFAULT 'maths',
      mobile TEXT NOT NULL,
      board TEXT DEFAULT 'state',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'present',
      UNIQUE(student_id, date)
    );

    CREATE TABLE IF NOT EXISTS weekly_tests (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      test_date TEXT NOT NULL,
      marks_obtained DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_marks DOUBLE PRECISION NOT NULL DEFAULT 100,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fee_payments (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
      paid_on TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function seedTeacher() {
  const teacher = await one('SELECT id FROM teachers WHERE email = $1', [TEACHER_EMAIL]);
  if (teacher) return;
  const passwordHash = await bcrypt.hash(TEACHER_PASSWORD, 10);
  await query('INSERT INTO teachers (name, email, password) VALUES ($1, $2, $3)', [TEACHER_NAME, TEACHER_EMAIL, passwordHash]);
}

app.post('/api/student/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const studentClass = String(req.body.class || '').trim();
  const mobile = String(req.body.mobile || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const subject = String(req.body.subject || 'maths').trim() || 'maths';

  if (!name || !studentClass || !mobile || !email || !password) {
    return res.status(400).json({ error: 'Name, class, mobile, email, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(`
      INSERT INTO students (name, email, password, class, subject, mobile, board)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, email, class, subject, mobile, board, created_at
    `, [name, email, passwordHash, studentClass, subject, mobile, 'state']);

    const student = normalizeStudent(result.rows[0]);
    res.json({ success: true, token: signStudent(student), student });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This email is already registered. Please login.' });
    }
    console.error('[POST /api/student/register]', error.message);
    res.status(500).json({ error: 'Could not register student.' });
  }
});

app.post('/api/student/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const student = await one('SELECT * FROM students WHERE email = $1', [email]);
    if (!student) return res.status(401).json({ error: 'Invalid email or password.' });

    const matches = await bcrypt.compare(password, student.password);
    if (!matches) return res.status(401).json({ error: 'Invalid email or password.' });

    const normalized = normalizeStudent(student);
    res.json({ success: true, token: signStudent(normalized), student: normalized });
  } catch (error) {
    console.error('[POST /api/student/login]', error.message);
    res.status(500).json({ error: 'Could not login student.' });
  }
});

app.get('/api/student/profile', authStudent, async (req, res) => {
  try {
    const student = await one(`
      SELECT id, name, email, class, subject, mobile, board, created_at
      FROM students
      WHERE id = $1
    `, [req.student.id]);

    const normalized = normalizeStudent(student);
    const monthAttendance = await buildAttendanceSummary(req.student.id, getMonthPrefix());
    const overallAttendance = await buildAttendanceSummary(req.student.id);
    const feeSummary = await buildFeeSummary(req.student.id, normalized.class);
    const weeklyTests = await getStudentWeeklyTests(req.student.id);
    const attendanceStreak = await buildAttendanceStreak(req.student.id);

    res.json({
      student: normalized,
      attendanceSummary: {
        month: monthAttendance,
        overall: overallAttendance
      },
      feeSummary,
      weeklyTests,
      attendanceStreak,
      build: APP_BUILD
    });
  } catch (error) {
    console.error('[GET /api/student/profile]', error.message);
    res.status(500).json({ error: 'Could not load student profile.' });
  }
});

app.post('/api/teacher/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Teacher email and password are required.' });

  try {
    const teacher = await one('SELECT * FROM teachers WHERE email = $1', [email]);
    if (!teacher) return res.status(401).json({ error: 'Invalid teacher login.' });

    const matches = await bcrypt.compare(password, teacher.password);
    if (!matches) return res.status(401).json({ error: 'Invalid teacher login.' });

    res.json({
      success: true,
      token: signTeacher(teacher),
      teacher: { id: Number(teacher.id), name: teacher.name, email: teacher.email }
    });
  } catch (error) {
    console.error('[POST /api/teacher/login]', error.message);
    res.status(500).json({ error: 'Could not login teacher.' });
  }
});

app.get('/api/teacher/students', authTeacher, async (req, res) => {
  try {
    const selectedDate = String(req.query.date || '').trim();
    const students = await buildTeacherStudentsSnapshot(selectedDate);
    res.json({
      teacher: { id: Number(req.teacher.id), name: req.teacher.name, email: req.teacher.email },
      selectedDate: selectedDate || null,
      students
    });
  } catch (error) {
    console.error('[GET /api/teacher/students]', error.message);
    res.status(500).json({ error: 'Could not load teacher dashboard.' });
  }
});

app.post('/api/teacher/attendance', authTeacher, async (req, res) => {
  const date = String(req.body.date || '').trim();
  const attendanceRows = Array.isArray(req.body.attendance) ? req.body.attendance : [];

  if (!date || !attendanceRows.length) {
    return res.status(400).json({ error: 'Attendance date and rows are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of attendanceRows) {
      const studentId = Number(row.studentId);
      const status = String(row.status || '').toLowerCase();
      if (!studentId || !['present', 'absent'].includes(status)) continue;
      await client.query(`
        INSERT INTO attendance (student_id, date, status)
        VALUES ($1, $2, $3)
        ON CONFLICT (student_id, date)
        DO UPDATE SET status = EXCLUDED.status
      `, [studentId, date, status]);
    }
    await client.query('COMMIT');

    res.json({
      success: true,
      updated: attendanceRows.length,
      students: await buildTeacherStudentsSnapshot(date)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /api/teacher/attendance]', error.message);
    res.status(500).json({ error: 'Could not save attendance.' });
  } finally {
    client.release();
  }
});

app.post('/api/teacher/weekly-tests', authTeacher, async (req, res) => {
  const title = String(req.body.title || '').trim();
  const testDate = String(req.body.testDate || '').trim();
  const totalMarks = Number(req.body.totalMarks || 100);
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

  if (!title || !testDate) {
    return res.status(400).json({ error: 'Test title and date are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      const studentId = Number(entry.studentId);
      if (!studentId || entry.marksObtained === '' || entry.marksObtained == null) continue;
      await client.query(`
        INSERT INTO weekly_tests (teacher_id, student_id, title, test_date, marks_obtained, total_marks, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        Number(req.teacher.id),
        studentId,
        title,
        testDate,
        Number(entry.marksObtained) || 0,
        totalMarks || 100,
        String(entry.notes || '').trim()
      ]);
    }
    await client.query('COMMIT');

    res.json({ success: true, students: await buildTeacherStudentsSnapshot() });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /api/teacher/weekly-tests]', error.message);
    res.status(500).json({ error: 'Could not save weekly tests.' });
  } finally {
    client.release();
  }
});

app.post('/api/teacher/fees', authTeacher, async (req, res) => {
  const paidOn = String(req.body.paidOn || '').trim();
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

  if (!paidOn) {
    return res.status(400).json({ error: 'Payment date is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      const studentId = Number(entry.studentId);
      const amountPaid = Number(entry.amountPaid);
      if (!studentId || !amountPaid) continue;
      await client.query(`
        INSERT INTO fee_payments (teacher_id, student_id, amount_paid, paid_on)
        VALUES ($1, $2, $3, $4)
      `, [Number(req.teacher.id), studentId, amountPaid, paidOn]);
    }
    await client.query('COMMIT');

    res.json({ success: true, students: await buildTeacherStudentsSnapshot() });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /api/teacher/fees]', error.message);
    res.status(500).json({ error: 'Could not save fees.' });
  } finally {
    client.release();
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await one('SELECT NOW() AS now');
    res.json({ status: 'ok', database: 'postgresql', timeZone: APP_TIMEZONE, build: APP_BUILD });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function start() {
  await ensureSchema();
  await seedTeacher();
  app.listen(PORT, () => {
    console.log(`I LEARN clean PostgreSQL app running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});









































