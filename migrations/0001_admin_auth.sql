-- There is one admin identity. Authentication reads and writes the primary D1 database.
CREATE TABLE IF NOT EXISTS admin_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  version TEXT NOT NULL
);
