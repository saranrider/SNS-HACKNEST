// The database: one SQLite file with a table per kind of record.
// Every read and write the server makes goes through the functions below,
// so moving to Postgres or MySQL later means rewriting only this file.
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { seedDatabase, seedRecords } = require("./seed");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id    TEXT PRIMARY KEY,
    role  TEXT NOT NULL,
    name  TEXT NOT NULL,
    title TEXT NOT NULL,
    salt  TEXT NOT NULL,
    hash  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS courses (
    code     TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    held     INTEGER NOT NULL,
    attended INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS od_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student     TEXT NOT NULL,
    event       TEXT NOT NULL,
    periods     INTEGER NOT NULL,
    attended    INTEGER NOT NULL,
    held        INTEGER NOT NULL,
    by_course   TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    approved_by TEXT REFERENCES users(id),
    approved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS desks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    auto_cleared INTEGER NOT NULL,
    open         INTEGER NOT NULL,
    wait_days    REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fees (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student     TEXT NOT NULL,
    item        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'due',
    recorded_by TEXT REFERENCES users(id),
    paid_at     TEXT
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id        TEXT PRIMARY KEY,
    text      TEXT NOT NULL,
    owner     TEXT NOT NULL,
    raised_by TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'open',
    raised_at TEXT NOT NULL,
    closed_by TEXT REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    text    TEXT NOT NULL,
    at      TEXT NOT NULL,
    read    INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS staff_inout (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  TEXT NOT NULL REFERENCES users(id),
    date     TEXT NOT NULL,
    in_time  TEXT NOT NULL,
    out_time TEXT
  );
  CREATE TABLE IF NOT EXISTS requests (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    text       TEXT NOT NULL,
    from_user  TEXT NOT NULL REFERENCES users(id),
    from_name  TEXT NOT NULL,
    to_role    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',
    raised_at  TEXT NOT NULL,
    decided_by TEXT REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS decisions (
    key TEXT PRIMARY KEY,
    by  TEXT NOT NULL REFERENCES users(id),
    at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    at     TEXT NOT NULL,
    user   TEXT NOT NULL,
    role   TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL
  );
`;

const RECORD_TABLES = ["courses", "od_requests", "desks", "fees", "tickets", "staff_inout", "requests", "notifications", "decisions", "audit"];

function createStore(file) {
  if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file || ":memory:"); // no file: in memory, used by the tests
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const insertRecords = db.transaction((records) => {
    const course = db.prepare("INSERT INTO courses (code, name, held, attended) VALUES (?, ?, ?, ?)");
    for (const c of records.courses) course.run(c.code, c.name, c.held, c.attended);

    const od = db.prepare(
      "INSERT INTO od_requests (student, event, periods, attended, held, by_course, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const r of records.odRequests) {
      od.run(r.student, r.event, r.periods, r.attended, r.held, r.byCourse ? JSON.stringify(r.byCourse) : null, r.status);
    }

    const desk = db.prepare("INSERT INTO desks (name, auto_cleared, open, wait_days) VALUES (?, ?, ?, ?)");
    for (const d of records.desks) desk.run(d.name, d.autoCleared, d.open, d.waitDays);

    const fee = db.prepare("INSERT INTO fees (student, item, status) VALUES (?, ?, ?)");
    for (const f of records.fees) fee.run(f.student, f.item, f.status);

    const inOut = db.prepare("INSERT INTO staff_inout (user_id, date, in_time, out_time) VALUES (?, ?, ?, ?)");
    for (const row of records.staffInOut) inOut.run(row.staff, row.date, row.in, row.out);
  });

  // A new database starts with the demo users and records.
  if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n === 0) {
    const seed = seedDatabase();
    const user = db.prepare("INSERT INTO users (id, role, name, title, salt, hash) VALUES (?, ?, ?, ?, ?, ?)");
    db.transaction(() => {
      for (const u of seed.users) user.run(u.id, u.role, u.name, u.title, u.salt, u.hash);
    })();
    insertRecords(seed);
  }

  const toOd = (row) => {
    const request = {
      student: row.student,
      event: row.event,
      periods: row.periods,
      attended: row.attended,
      held: row.held,
      status: row.status,
    };
    if (row.by_course) request.byCourse = JSON.parse(row.by_course);
    return request;
  };

  return {
    findUser: (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id),

    findUserByName: (name) => db.prepare("SELECT * FROM users WHERE name = ?").get(name),

    usersWithRole: (role) => db.prepare("SELECT * FROM users WHERE role = ?").all(role),

    // A message for one person, shown on their page until they have read it.
    addNotification: (userId, text) => {
      db.prepare("INSERT INTO notifications (user_id, text, at) VALUES (?, ?, ?)").run(userId, text, new Date().toISOString());
    },

    notificationsFor: (userId) =>
      db
        .prepare("SELECT id, text, at, read FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 20")
        .all(userId)
        .map((row) => ({ id: row.id, text: row.text, at: row.at, read: row.read === 1 })),

    markNotificationsRead: (userId) => {
      db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(userId);
    },

    // Approvals and issues that are a single yes: a syllabus approved,
    // marks verified, a certificate or hall ticket issued.
    decisions: () => db.prepare("SELECT key FROM decisions ORDER BY at, rowid").all().map((row) => row.key),

    addDecision: (key, userId) => {
      const result = db
        .prepare("INSERT OR IGNORE INTO decisions (key, by, at) VALUES (?, ?, ?)")
        .run(key, userId, new Date().toISOString());
      return result.changes ? "done" : "unchanged";
    },

    // Something one person asks another role to accept: a new OD request,
    // a certificate, a referral to publish, a duty change.
    requests: () =>
      db
        .prepare(
          "SELECT id, kind, text, from_user AS fromUser, from_name AS fromName, to_role AS toRole, status, raised_at AS raisedAt FROM requests ORDER BY raised_at, rowid"
        )
        .all(),

    findRequest: (id) =>
      db
        .prepare("SELECT id, kind, text, from_user AS fromUser, from_name AS fromName, to_role AS toRole, status FROM requests WHERE id = ?")
        .get(id) || null,

    addRequest: (request) => {
      db.prepare(
        "INSERT INTO requests (id, kind, text, from_user, from_name, to_role, status, raised_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)"
      ).run(request.id, request.kind, request.text, request.fromUser, request.fromName, request.toRole, request.raisedAt);
    },

    acceptRequest: (id, userId) => {
      const result = db
        .prepare("UPDATE requests SET status = 'accepted', decided_by = ? WHERE id = ? AND status = 'open'")
        .run(userId, id);
      return result.changes ? "done" : "unchanged";
    },

    // One person's own in and out times, oldest first.
    inOutFor: (userId) =>
      db.prepare("SELECT date, in_time AS \"in\", out_time AS out FROM staff_inout WHERE user_id = ? ORDER BY date").all(userId),

    ticketRaiser: (id) => {
      const row = db.prepare("SELECT raised_by AS raisedBy, text FROM tickets WHERE id = ?").get(id);
      return row || null;
    },

    courses: () => db.prepare("SELECT code, name, held, attended FROM courses ORDER BY rowid").all(),

    odRequests: () => db.prepare("SELECT * FROM od_requests ORDER BY id").all().map(toOd),

    desks: () =>
      db.prepare("SELECT name, auto_cleared AS autoCleared, open, wait_days AS waitDays FROM desks ORDER BY id").all(),

    tickets: () =>
      db
        .prepare(
          "SELECT id, text, owner, raised_by AS raisedBy, status, raised_at AS raisedAt FROM tickets ORDER BY raised_at, rowid"
        )
        .all(),

    approvedStudents: () =>
      db.prepare("SELECT student FROM od_requests WHERE status = 'approved' ORDER BY id").all().map((row) => row.student),

    feeStatus: (student) => {
      const row = db.prepare("SELECT status FROM fees WHERE student = ? ORDER BY id LIMIT 1").get(student);
      return row ? row.status : null;
    },

    // Each of these returns "missing", "unchanged" or "done".
    approveOd: (student, userId) => {
      const row = db.prepare("SELECT id, status FROM od_requests WHERE student = ? ORDER BY id LIMIT 1").get(student);
      if (!row) return "missing";
      if (row.status === "approved") return "unchanged";
      db.prepare("UPDATE od_requests SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?").run(
        userId,
        new Date().toISOString(),
        row.id
      );
      return "done";
    },

    payFee: (student, userId) => {
      const row = db.prepare("SELECT id, status FROM fees WHERE student = ? ORDER BY id LIMIT 1").get(student);
      if (!row) return "missing";
      if (row.status === "paid") return "unchanged";
      db.prepare("UPDATE fees SET status = 'paid', recorded_by = ?, paid_at = ? WHERE id = ?").run(
        userId,
        new Date().toISOString(),
        row.id
      );
      return "done";
    },

    addTicket: (ticket) => {
      db.prepare("INSERT INTO tickets (id, text, owner, raised_by, status, raised_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        ticket.id,
        ticket.text,
        ticket.owner,
        ticket.raisedBy,
        ticket.status,
        ticket.raisedAt
      );
    },

    closeTicket: (id, userId) => {
      const result = db.prepare("UPDATE tickets SET status = 'closed', closed_by = ? WHERE id = ?").run(userId, id);
      return result.changes ? "done" : "missing";
    },

    addAudit: (entry) => {
      db.prepare("INSERT INTO audit (at, user, role, action, target) VALUES (?, ?, ?, ?, ?)").run(
        entry.at,
        entry.user,
        entry.role,
        entry.action,
        entry.target
      );
    },

    recentAudit: (limit) =>
      db.prepare("SELECT at, user, role, action, target FROM audit ORDER BY id DESC LIMIT ?").all(limit),

    // Puts the demo records back to the start. Users and passwords are kept.
    reset: db.transaction(() => {
      for (const table of RECORD_TABLES) db.prepare("DELETE FROM " + table).run();
      insertRecords(seedRecords());
    }),

    close: () => db.close(),
  };
}

module.exports = { createStore };
