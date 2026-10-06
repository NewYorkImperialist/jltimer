// Database schema, applied idempotently on first request.
export default `
-- jlTimer personal backup database (Turso / libSQL / SQLite)

-- the single login: verifier = SHA-256(PBKDF2(normalized moves, salt)), computed in the browser
CREATE TABLE IF NOT EXISTS credential (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	salt TEXT NOT NULL,
	iterations INTEGER NOT NULL,
	verifier TEXT NOT NULL,
	fp_salt TEXT NOT NULL, -- public gesture fingerprint, lets the client skip ordinary cancels
	fp_len INTEGER NOT NULL,
	fp_tag INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- one-time recovery codes, hashed
CREATE TABLE IF NOT EXISTS recovery (
	code_hash TEXT PRIMARY KEY,
	used_at INTEGER
);

-- signed-in devices; token_hash = HMAC(SESSION_SECRET, device token)
CREATE TABLE IF NOT EXISTS device (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	token_hash TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	last_seen INTEGER NOT NULL,
	revoked_at INTEGER
);

-- append-only backups: gzip of the jlTimer/csTimer export JSON
CREATE TABLE IF NOT EXISTS snapshot (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL,
	kind TEXT NOT NULL,
	solves INTEGER NOT NULL,
	bytes INTEGER NOT NULL,
	sha256 TEXT NOT NULL,
	data BLOB NOT NULL
);

-- failed login attempts per (hashed) IP and globally, in fixed windows
CREATE TABLE IF NOT EXISTS attempt (
	scope TEXT NOT NULL,
	window_start INTEGER NOT NULL,
	count INTEGER NOT NULL,
	PRIMARY KEY (scope, window_start)
);
`;
