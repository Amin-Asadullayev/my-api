import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from '../src/config.js';
import * as moviesSchema from './schema/movies.js';
import * as usersSchema from './schema/users.js';

// Default journal mode on purpose: switching to WAL would rewrite movies.db's header.
const moviesClient = new Database(config.moviesDbPath, { fileMustExist: true });
export const moviesDb = drizzle({ client: moviesClient });
export const { movies } = moviesSchema;

const authClient = new Database(config.authDbPath);
authClient.pragma('journal_mode = WAL');
authClient.pragma('foreign_keys = ON');
authClient.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
`);
export const authDb = drizzle({ client: authClient });
export const { users, refreshTokens } = usersSchema;

export function closeDatabases(): void {
  moviesClient.close();
  authClient.close();
}
