-- Майстри. id = Telegram user id.
CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  first_name  TEXT,
  username    TEXT,
  role        TEXT NOT NULL DEFAULT 'tech'    CHECK (role IN ('admin', 'tech')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked')),
  home_lat    REAL,
  home_lon    REAL,
  settings    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tickets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  number       TEXT    NOT NULL,
  priority     INTEGER NOT NULL,
  marker       TEXT,
  type         TEXT    NOT NULL CHECK (type IN ('connect', 'repair', 'other')),
  type_raw     TEXT,
  visit_time   TEXT,
  work_date    TEXT    NOT NULL,
  address_raw  TEXT    NOT NULL,
  street       TEXT,
  house        TEXT,
  flat         TEXT,
  address_key  TEXT,
  lat          REAL,
  lon          REAL,
  geo_status   TEXT    NOT NULL DEFAULT 'pending' CHECK (geo_status IN ('pending', 'found', 'approx', 'not_found')),
  status       TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  route_pos    INTEGER,
  eta          TEXT,
  report_text  TEXT,
  done_at      TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, number)
);

CREATE INDEX tickets_user_status ON tickets (user_id, status, route_pos);
CREATE INDEX tickets_address_key ON tickets (address_key);
CREATE INDEX tickets_geo_pending ON tickets (id) WHERE geo_status = 'pending';

-- Спільний для всіх майстрів кеш координат. precision = 'none' — адресу не знайдено.
CREATE TABLE geocache (
  address_key  TEXT PRIMARY KEY,
  lat          REAL,
  lon          REAL,
  precision    TEXT NOT NULL CHECK (precision IN ('house', 'street', 'none')),
  source       TEXT NOT NULL,
  label        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text        TEXT    NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX templates_user ON templates (user_id, sort);

-- Що бот чекає від майстра наступним повідомленням (геоточку, свій текст звіту тощо).
CREATE TABLE user_state (
  user_id     INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
