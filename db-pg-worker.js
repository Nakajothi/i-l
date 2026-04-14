const { parentPort, workerData } = require('worker_threads');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: workerData.connectionString,
  ssl: workerData.disableSsl ? false : { rejectUnauthorized: false }
});

let txClient = null;
const responsePort = workerData.responsePort;

function convertSql(sql) {
  let s = String(sql || '');

  // --- Parameter placeholders ---
  let index = 0;
  s = s.replace(/\?/g, () => `$${++index}`);

  // --- Type conversions ---
  s = s.replace(/\bAUTOINCREMENT\b/gi, '');
  s = s.replace(/\bINTEGER\s+PRIMARY\s+KEY\b/gi, 'SERIAL PRIMARY KEY');
  s = s.replace(/\bDATETIME\s+DEFAULT\s+CURRENT_TIMESTAMP\b/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  s = s.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
  s = s.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');

  // --- INSERT OR REPLACE -> upsert ---
  // attendance: compound PK (student_id, date)
  s = s.replace(
    /INSERT\s+OR\s+REPLACE\s+INTO\s+attendance\s*\(\s*student_id\s*,\s*date\s*,\s*status\s*\)\s*VALUES\s*\(([^)]+)\)/gi,
    (m, vals) => `INSERT INTO attendance (student_id, date, status) VALUES (${vals}) ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status`
  );

  // Generic INSERT OR REPLACE for other tables (uses first col as conflict target)
  s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
    (match, table, cols, vals) => {
      const colList = cols.split(',').map(c => c.trim());
      const setClauses = colList.slice(1).map(c => `${c} = EXCLUDED.${c}`).join(', ');
      if (setClauses) {
        return `INSERT INTO ${table} (${cols}) VALUES (${vals}) ON CONFLICT (${colList[0]}) DO UPDATE SET ${setClauses}`;
      }
      return `INSERT INTO ${table} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING`;
    }
  );
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');

  // --- Unique index fixes (partial index for nullable columns) ---
  s = s.replace(
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_students_google_sub\s+ON\s+students\s*\(\s*google_sub\s*\)/gi,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_students_google_sub ON students (google_sub) WHERE google_sub IS NOT NULL'
  );
  s = s.replace(
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_teachers_google_sub\s+ON\s+teachers\s*\(\s*google_sub\s*\)/gi,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_google_sub ON teachers (google_sub) WHERE google_sub IS NOT NULL'
  );

  // --- Date/time functions ---
  s = s.replace(/date\s*\(\s*'now'\s*,\s*'-(\d+)\s+days?'\s*\)/gi, "(CURRENT_DATE - INTERVAL '$1 days')");
  s = s.replace(/datetime\s*\(\s*'now'\s*,\s*'-(\d+)\s+days?'\s*\)/gi, "(CURRENT_TIMESTAMP - INTERVAL '$1 days')");
  s = s.replace(/date\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');
  s = s.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');

  // Strip datetime() / date() wrappers
  s = s.replace(/datetime\s*\(\s*MAX\s*\(([^)]+)\)\s*\)/gi, 'MAX($1)');
  s = s.replace(/datetime\s*\(\s*([^()]+)\s*\)/gi, '$1');
  s = s.replace(/date\s*\(\s*([^()]+)\s*\)/gi, 'DATE($1)');

  return s;
}

function splitStatements(sql) {
  return String(sql || '')
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.trim())
    .filter(Boolean);
}

async function execute(action, sql, params) {
  const runner = txClient || pool;

  if (action === 'exec') {
    for (const stmt of splitStatements(sql)) {
      try {
        await runner.query(convertSql(stmt));
      } catch (err) {
        // Ignore benign schema errors on repeated startups
        const benign = [
          'already exists', 'duplicate column', 'does not exist',
          '42701', '42P07', '42703', '42P01'
        ];
        if (benign.some(b => err.message.includes(b) || err.code === b)) continue;
        console.error('[exec error]', err.message, '|', stmt.slice(0, 80));
        // Don't throw on ALTER TABLE errors — they fail on re-run
        if (/^ALTER\s+TABLE/i.test(stmt)) continue;
        throw err;
      }
    }
    return { ok: true };
  }

  if (action === 'begin') {
    txClient = await pool.connect();
    await txClient.query('BEGIN');
    return { ok: true };
  }
  if (action === 'commit') {
    if (txClient) { await txClient.query('COMMIT'); txClient.release(); txClient = null; }
    return { ok: true };
  }
  if (action === 'rollback') {
    if (txClient) {
      try { await txClient.query('ROLLBACK'); } catch {}
      txClient.release(); txClient = null;
    }
    return { ok: true };
  }

  const converted = convertSql(sql);

  if (action === 'run') {
    const isInsert = /^\s*insert\b/i.test(converted);
    const hasReturning = /\breturning\b/i.test(converted);
    const finalSql = isInsert && !hasReturning ? `${converted} RETURNING id` : converted;

    try {
      const result = await runner.query(finalSql, params || []);
      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
        lastInsertRowid: result.rows?.[0]?.id ?? null
      };
    } catch (err) {
      // Fallback: run without RETURNING if it failed
      if (isInsert && !hasReturning) {
        const result = await runner.query(converted, params || []);
        return { rows: result.rows || [], rowCount: result.rowCount || 0, lastInsertRowid: null };
      }
      throw err;
    }
  }

  const result = await runner.query(converted, params || []);
  return { rows: result.rows || [], rowCount: result.rowCount || 0 };
}

parentPort.on('message', async (message) => {
  const { id, action, sql, params, shared } = message;
  const signal = new Int32Array(shared);
  try {
    const payload = await execute(action, sql, params);
    responsePort.postMessage({ id, ok: true, payload });
  } catch (error) {
    console.error('[DB Worker]', action, '|', sql?.slice(0, 100), '|', error.message);
    responsePort.postMessage({ id, ok: false, error: error.message || String(error) });
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0, 1);
  }
});