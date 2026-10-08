// PSNA Hacknext - backend.
// Serves the pages in ../docs and a small JSON API so that sign-in is
// checked on the server and every device sees the same records.
const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const { createStore } = require("./store");
const { seedRecords, hashPassword } = require("./seed");

const SESSION_HOURS = 8;
const TICKET_OWNERS = ["Support desk", "Class advisor", "Accounts", "Examinations"];
const MAX_FAILED_LOGINS = 5;
const LOCK_SECONDS = 60;

function createApp(store) {
  const app = express();
  const db = store.data;
  const sessions = new Map(); // token -> { userId, expires }
  const failures = new Map(); // user id -> { count, lockedUntil }

  app.use(express.json({ limit: "20kb" }));

  // Lets the pages be hosted somewhere else (for example GitHub Pages).
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  app.use((req, res, next) => {
    if (allowedOrigin) {
      res.set("Access-Control-Allow-Origin", allowedOrigin);
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "GET, POST");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  function record(user, action, target) {
    db.audit.push({ at: new Date().toISOString(), user: user.id, role: user.role, action, target });
    if (db.audit.length > 200) db.audit.shift();
  }

  // The shape the pages expect: who has an approved OD, and Devi's fee.
  function publicState() {
    const demoFee = db.fees.find((fee) => fee.student === "Devi");
    return {
      odApproved: db.odRequests.filter((r) => r.status === "approved").map((r) => r.student),
      feePaid: demoFee.status === "paid",
      tickets: db.tickets,
    };
  }

  function requireUser(req, res, next) {
    const header = req.get("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const session = sessions.get(token);
    if (!session || session.expires < Date.now()) {
      sessions.delete(token);
      return res.status(401).json({ error: "Sign in first." });
    }
    req.user = db.users.find((user) => user.id === session.userId);
    req.token = token;
    next();
  }

  const requireRole = (role) => (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Only " + role + " can do this." });
    }
    next();
  };

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  app.post("/api/login", (req, res) => {
    const id = String((req.body && req.body.id) || "").trim().toLowerCase();
    const password = String((req.body && req.body.password) || "");

    const failed = failures.get(id) || { count: 0, lockedUntil: 0 };
    if (failed.lockedUntil > Date.now()) {
      const wait = Math.ceil((failed.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({ error: "Too many attempts. Try again in " + wait + " seconds." });
    }

    const user = db.users.find((item) => item.id === id);
    // Hash even when the user does not exist, so both cases take the same time.
    const salt = user ? user.salt : "00";
    const given = Buffer.from(hashPassword(password, salt), "hex");
    const stored = Buffer.from(user ? user.hash : "00".repeat(32), "hex");
    const correct = Boolean(user) && crypto.timingSafeEqual(given, stored);

    if (!correct) {
      failed.count += 1;
      if (failed.count >= MAX_FAILED_LOGINS) {
        failed.count = 0;
        failed.lockedUntil = Date.now() + LOCK_SECONDS * 1000;
      }
      failures.set(id, failed);
      // one message for a wrong ID and a wrong password
      return res.status(401).json({ error: "User ID or password is not correct." });
    }

    failures.delete(id);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_HOURS * 3600 * 1000 });
    res.json({ token, role: user.role, name: user.name, title: user.title });
  });

  app.post("/api/logout", requireUser, (req, res) => {
    sessions.delete(req.token);
    res.json({ ok: true });
  });

  app.get("/api/state", requireUser, (req, res) => res.json(publicState()));

  app.post("/api/od/approve", requireUser, requireRole("staff"), (req, res) => {
    const request = db.odRequests.find((item) => item.student === (req.body && req.body.student));
    if (!request) return res.status(404).json({ error: "No OD request for that student." });
    if (request.status !== "approved") {
      request.status = "approved";
      request.approvedBy = req.user.id;
      request.approvedAt = new Date().toISOString();
      record(req.user, "od.approve", request.student);
      store.save();
    }
    res.json(publicState());
  });

  app.post("/api/fees/pay", requireUser, requireRole("admin"), (req, res) => {
    const fee = db.fees.find((item) => item.student === (req.body && req.body.student));
    if (!fee) return res.status(404).json({ error: "No fee record for that student." });
    if (fee.status !== "paid") {
      fee.status = "paid";
      fee.recordedBy = req.user.id;
      fee.paidAt = new Date().toISOString();
      record(req.user, "fee.pay", fee.student);
      store.save();
    }
    res.json(publicState());
  });

  // The records the dashboards draw from.
  app.get("/api/records", requireUser, (req, res) => {
    res.json({ courses: db.courses, odRequests: db.odRequests, desks: db.desks });
  });

  // A student's query or a staff member's campus issue.
  app.post("/api/tickets", requireUser, (req, res) => {
    const text = String((req.body && req.body.text) || "").trim();
    if (text.length < 3 || text.length > 300) {
      return res.status(400).json({ error: "Write between 3 and 300 characters." });
    }
    const asked = req.body && req.body.owner;
    const owner = TICKET_OWNERS.includes(asked) ? asked : TICKET_OWNERS[0];
    const ticket = {
      id: crypto.randomUUID().slice(0, 8),
      text,
      owner,
      raisedBy: req.user.name,
      status: "open",
      raisedAt: new Date().toISOString(),
    };
    db.tickets.push(ticket);
    record(req.user, "ticket.raise", ticket.id);
    store.save();
    res.status(201).json(publicState());
  });

  app.post("/api/tickets/close", requireUser, requireRole("admin"), (req, res) => {
    const ticket = db.tickets.find((item) => item.id === (req.body && req.body.id));
    if (!ticket) return res.status(404).json({ error: "No ticket with that ID." });
    ticket.status = "closed";
    ticket.closedBy = req.user.id;
    record(req.user, "ticket.close", ticket.id);
    store.save();
    res.json(publicState());
  });

  // Who did what, for the office and the examinations office.
  app.get("/api/audit", requireUser, (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "coe") {
      return res.status(403).json({ error: "Only admin and COE can read the audit log." });
    }
    res.json(db.audit.slice(-50).reverse());
  });

  // Puts the demo records back to the start. Users and passwords are kept.
  app.post("/api/reset", requireUser, (req, res) => {
    Object.assign(db, seedRecords());
    record(req.user, "demo.reset", "all");
    store.save();
    res.json(publicState());
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Unknown API path." }));
  app.use(express.static(path.join(__dirname, "..", "docs")));

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const store = createStore(path.join(__dirname, "data", "db.json"));
  createApp(store).listen(port, () => {
    console.log("PSNA Hacknext is running at http://localhost:" + port);
  });
}

module.exports = { createApp };
