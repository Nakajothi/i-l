const path = require('path');
const { Worker, MessageChannel, receiveMessageOnPort } = require('worker_threads');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATABASE_URL = process.env.DATABASE_URL || '';
const USING_POSTGRES = true;

let worker = null;
let responsePort = null;
let requestId = 0;

function ensureWorker() {
  if (!worker) {
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL is required. This app is configured for PostgreSQL only.');
    }
    const channel = new MessageChannel();
    responsePort = channel.port1;
    worker = new Worker(path.join(__dirname, 'db-pg-worker.js'), {
      workerData: {
        connectionString: DATABASE_URL,
        disableSsl: process.env.PGSSLMODE === 'disable',
        responsePort: channel.port2
      },
      transferList: [channel.port2]
    });
  }
  return worker;
}

function send(action, sql, params = []) {
  const id = ++requestId;
  const shared = new SharedArrayBuffer(4);
  const signal = new Int32Array(shared);
  const activeWorker = ensureWorker();
  activeWorker.postMessage({ id, action, sql, params, shared });
  Atomics.wait(signal, 0, 0);
  let response = null;
  while (!response) {
    const received = receiveMessageOnPort(responsePort);
    if (received && received.message && received.message.id === id) {
      response = received.message;
    }
  }
  if (!response) {
    throw new Error('Database worker did not respond.');
  }
  if (!response.ok) {
    throw new Error(response.error || 'Database query failed.');
  }
  return response.payload;
}

function createPgStyleDb() {
  return {
    prepare(sql) {
      return {
        get(...params) {
          return send('get', sql, params).rows?.[0] || undefined;
        },
        all(...params) {
          return send('all', sql, params).rows || [];
        },
        run(...params) {
          const payload = send('run', sql, params);
          return {
            changes: payload.rowCount || 0,
            lastInsertRowid: payload.lastInsertRowid
          };
        }
      };
    },
    exec(sql) {
      send('exec', sql, []);
    },
    transaction(fn) {
      return (...args) => {
        send('begin', '', []);
        try {
          const result = fn(...args);
          send('commit', '', []);
          return result;
        } catch (error) {
          try {
            send('rollback', '', []);
          } catch {}
          throw error;
        }
      };
    }
  };
}

module.exports = {
  db: createPgStyleDb(),
  USING_POSTGRES,
  DATA_DIR,
  DATABASE_URL
};
