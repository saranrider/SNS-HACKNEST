// PSNA Hacknext - backend.
// Serves the pages in ../docs and a small JSON API so that sign-in is
// checked on the server and every device sees the same records.
const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const { createStore } = require("./store");
const { hashPassword } = require("./seed");

const SESSION_HOURS = 8;
const TICKET_OWNERS = ["Support desk", "Class advisor", "Accounts", "Examinations"];
const MAX_FAILED_LOGINS = 5;
const LOCK_SECONDS = 60;

function createApp(store) {
  const app = express();
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
    store.addAudit({ at: new Date().toISOString(), user: user.id, role: user.role, action, target });
  }

  // The shape the pages expect: who has an approved OD, and Devi's fee.
  function publicState() {
    return {
      odApproved: store.approvedStudents(),
      feePaid: store.feeStatus("Devi") === "paid",
      tickets: store.tickets(),
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
    req.user = store.findUser(session.userId);
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

    const user = store.findUser(id);
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
    const student = String((req.body && req.body.student) || "");
    const outcome = store.approveOd(student, req.user.id);
    if (outcome === "missing") return res.status(404).json({ error: "No OD request for that student." });
    if (outcome === "done") record(req.user, "od.approve", student);
    res.json(publicState());
  });

  app.post("/api/fees/pay", requireUser, requireRole("admin"), (req, res) => {
    const student = String((req.body && req.body.student) || "");
    const outcome = store.payFee(student, req.user.id);
    if (outcome === "missing") return res.status(404).json({ error: "No fee record for that student." });
    if (outcome === "done") record(req.user, "fee.pay", student);
    res.json(publicState());
  });

  // The records the dashboards draw from.
  app.get("/api/records", requireUser, (req, res) => {
    res.json({ courses: store.courses(), odRequests: store.odRequests(), desks: store.desks() });
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
    store.addTicket(ticket);
    record(req.user, "ticket.raise", ticket.id);
    res.status(201).json(publicState());
  });

  app.post("/api/tickets/close", requireUser, requireRole("admin"), (req, res) => {
    const id = String((req.body && req.body.id) || "");
    if (store.closeTicket(id, req.user.id) === "missing") {
      return res.status(404).json({ error: "No ticket with that ID." });
    }
    record(req.user, "ticket.close", id);
    res.json(publicState());
  });

  // Who did what, for the office and the examinations office.
  app.get("/api/audit", requireUser, (req, res) => {
    if (req.user.role !== "admin" && req.user.role !== "coe") {
      return res.status(403).json({ error: "Only admin and COE can read the audit log." });
    }
    res.json(store.recentAudit(50));
  });

  // Puts the demo records back to the start. Users and passwords are kept.
  app.post("/api/reset", requireUser, (req, res) => {
    store.reset();
    record(req.user, "demo.reset", "all");
    res.json(publicState());
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Unknown API path." }));
  app.use(express.static(path.join(__dirname, "..", "docs")));

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const store = createStore(process.env.DATABASE_FILE || path.join(__dirname, "data", "hacknext.db"));
  createApp(store).listen(port, () => {
    console.log("PSNA Hacknext is running at http://localhost:" + port);
  });
}

module.exports = { createApp };
