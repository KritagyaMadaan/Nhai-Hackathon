import { open } from 'react-native-quick-sqlite';

/**
 * PRODUCTION DATABASE SERVICE
 * Uses High-performance JSI-based SQLite.
 */

const db = open({ name: 'nhai_secure_auth.db' });

export const initDatabase = () => {
  // 1. Users Table (Stores Face Embeddings)
  db.execute(`
    CREATE TABLE IF NOT EXISTS Users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      embedding_vector BLOB NOT NULL, -- 128 float values
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. AuthLogs Table (Offline Events)
  db.execute(`
    CREATE TABLE IF NOT EXISTS AuthLogs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      confidence REAL,
      liveness_status TEXT,
      sync_status INTEGER DEFAULT 0 -- 0=Pending, 1=Synced
    )
  `);

  console.log('Production SQLite Database Initialized.');
};

export const registerUser = (id: string, name: string, embedding: Float32Array) => {
  // Convert Float32Array to Buffer/ArrayBuffer for SQLite BLOB storage
  db.execute(
    'INSERT INTO Users (id, name, embedding_vector) VALUES (?, ?, ?)',
    [id, name, embedding.buffer]
  );
};

export const getAllUsers = () => {
  const result = db.execute('SELECT * FROM Users');
  const rows = result.rows?._array || [];
  return rows.map(row => ({
    ...row,
    embedding: new Float32Array(row.embedding_vector)
  }));
};

export const logAuthAttempt = (userId: string, confidence: number, liveness: string) => {
  const id = Math.random().toString(36).substring(7);
  db.execute(
    'INSERT INTO AuthLogs (id, user_id, confidence, liveness_status) VALUES (?, ?, ?, ?)',
    [id, userId, confidence, liveness]
  );
};

export const getUnsyncedLogs = () => {
  const result = db.execute('SELECT * FROM AuthLogs WHERE sync_status = 0');
  return result.rows?._array || [];
};

export const markAsSynced = (logIds: string[]) => {
  if (logIds.length === 0) return;
  const placeholders = logIds.map(() => '?').join(',');
  db.execute(`UPDATE AuthLogs SET sync_status = 1 WHERE id IN (${placeholders})`, logIds);
};

export const purgeSyncedLogs = () => {
  db.execute('DELETE FROM AuthLogs WHERE sync_status = 1');
};
