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
// Each single-step approval: who may give it, what must come first, who is
// told, and which roles see that it happened.
const DECISIONS = {
  "syllabus.ds": {
    role: "coe",
    tell: [["staff", "The COE approved the Data Structures syllabus."]],
    seenBy: ["staff", "coe"],
  },
  "syllabus.se": {
    role: "coe",
    tell: [["staff", "The COE approved the Software Engineering syllabus."]],
    seenBy: ["staff", "coe"],
  },
  "cert.lakshmi": {
    role: "coe",
    tell: [
      ["admin", "Marks verified for the transcript of Lakshmi V. It is ready to issue."],
      ["alumni", "The COE has verified your marks. Your transcript is now with the admin desk."],
    ],
    seenBy: ["coe", "admin", "alumni"],
  },
  "cert.suresh": {
    role: "coe",
    tell: [["admin", "Marks verified for the course completion certificate of Suresh N. It is ready to issue."]],
    seenBy: ["coe", "admin"],
  },
  "cert.lakshmi.issue": {
    role: "admin",
    needs: "cert.lakshmi",
    tell: [["alumni", "Your transcript has been issued. You can download it with its QR code."]],
    seenBy: ["coe", "admin", "alumni"],
  },
  "cert.anitha.issue": { role: "admin", tell: [], seenBy: ["coe", "admin"] },
  "hallticket.devi": {
    role: "coe",
    needsReady: "Devi",
    tell: [["student", "Your hall ticket has been issued by the COE."]],
    seenBy: ["student", "coe"],
  },
  "project.devi": {
    role: "staff",
    tell: [["student", "Saran accepted your proposal. You can continue the 2024 face recognition attendance project."]],
    seenBy: ["student", "staff"],
  },
  "attendance.p5": { role: "staff", tell: [], seenBy: ["staff"] },
  "fees.remind": {
    role: "admin",
    tell: [["student", "Reminder from the accounts desk: your exam fee is due and is holding your hall ticket."]],
    seenBy: ["admin"],
  },
};

// What one role can ask another to accept. "announce" names a role that is
// also told once the request is accepted.
const REQUEST_KINDS = {
  od: { from: "student", to: "staff", label: "OD request", accepted: "approved", dated: true },
  hallticket: { from: "student", to: "coe", label: "Hall ticket request", accepted: "issued", needsReady: true, decision: "hallticket.devi" },
  submission: { from: "student", to: "staff", label: "Assignment submission", accepted: "accepted" },
  // anything else goes one step up: to the person's own superior
  general: { toBy: { student: "staff", staff: "coe", coe: "admin", alumni: "admin" }, label: "Request", accepted: "accepted" },
  duty: { from: "staff", to: "admin", label: "Duty change", accepted: "approved" },
  certificate: { from: "alumni", to: "admin", label: "Certificate request", accepted: "issued" },
  referral: { from: "alumni", to: "admin", label: "Job referral", accepted: "published", announce: "student" },
  mentoring: { from: "alumni", to: "admin", label: "Mentoring offer", accepted: "published", announce: "student" },
  business: { from: "alumni", to: "admin", label: "Business listing", accepted: "listed" },
  profile: { from: "alumni", to: "admin", label: "Record update", accepted: "updated" },
};

// "2026-10-12T09:00" -> "12 Oct 2026, 09:00", or "" if it is not a date and time.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function readableDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match || Number.isNaN(Date.parse(match[0]))) return "";
  return Number(match[3]) + " " + MONTHS[Number(match[2]) - 1] + " " + match[1] + ", " + match[4] + ":" + match[5];
}

const DEMO_STUDENT = "Devi"; // the student whose case the staff, COE and admin pages follow

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

  // Sends a message to one person, or to everyone holding a role.
  function notifyUser(name, text) {
    const user = store.findUserByName(name);
    if (user) store.addNotification(user.id, text);
  }
  function notifyRole(role, text) {
    for (const user of store.usersWithRole(role)) store.addNotification(user.id, text);
  }

  // Once attendance and dues are both in order, the student and the
  // examinations office are told that the hall ticket can be issued.
  function announceIfReady(student) {
    if (!store.approvedStudents().includes(student) || store.feeStatus(student) !== "paid") return;
    notifyUser(student, "Your hall ticket is ready to issue: attendance and dues are both clear.");
    notifyRole("coe", student + " is now eligible. The hall ticket is ready to issue.");
  }

  // What one signed-in person may see. Students and alumni get only their
  // own items; staff, COE and the office get the records they act on.
  function publicState(user) {
    const everything = user.role === "staff" || user.role === "coe" || user.role === "admin";
    const approved = store.approvedStudents();
    const tickets = store.tickets();
    return {
      odApproved: everything ? approved : approved.filter((name) => name === user.name),
      feePaid: user.role === "alumni" ? false : store.feeStatus(everything ? DEMO_STUDENT : user.name) === "paid",
      tickets: user.role === "admin" ? tickets : tickets.filter((ticket) => ticket.raisedBy === user.name),
      requests: store
        .requests()
        .filter((item) => item.fromUser === user.id || item.toRole === user.role)
        .map(({ fromUser, ...rest }) => rest),
      decisions: store.decisions().filter((key) => DECISIONS[key] && DECISIONS[key].seenBy.includes(user.role)),
      notifications: store.notificationsFor(user.id).map((item) => Object.assign({ to: user.role }, item)),
    };
  }

  function recordsFor(user) {
    const requests = store.odRequests();
    if (user.role === "student") {
      return { courses: store.courses(), odRequests: requests.filter((item) => item.student === user.name) };
    }
    if (user.role === "staff" || user.role === "coe") return { courses: store.courses(), odRequests: requests };
    if (user.role === "admin") return { courses: store.courses(), odRequests: requests, desks: store.desks() };
    return {};
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

  app.get("/api/state", requireUser, (req, res) => res.json(publicState(req.user)));

  app.post("/api/od/approve", requireUser, requireRole("staff"), (req, res) => {
    const student = String((req.body && req.body.student) || "");
    const outcome = store.approveOd(student, req.user.id);
    if (outcome === "missing") return res.status(404).json({ error: "No OD request for that student." });
    if (outcome === "done") {
      record(req.user, "od.approve", student);
      notifyUser(student, "Your OD request was approved by " + req.user.name + ". Your attendance has been updated.");
      announceIfReady(student);
    }
    res.json(publicState(req.user));
  });

  app.post("/api/fees/pay", requireUser, requireRole("admin"), (req, res) => {
    const student = String((req.body && req.body.student) || "");
    const outcome = store.payFee(student, req.user.id);
    if (outcome === "missing") return res.status(404).json({ error: "No fee record for that student." });
    if (outcome === "done") {
      record(req.user, "fee.pay", student);
      notifyUser(student, "Your fee payment was recorded. The accounts desk has cleared your dues.");
      announceIfReady(student);
    }
    res.json(publicState(req.user));
  });

  // The records the dashboards draw from.
  app.get("/api/records", requireUser, (req, res) => {
    res.json(recordsFor(req.user));
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
    notifyRole("admin", "New request from " + req.user.name + ": " + text);
    res.status(201).json(publicState(req.user));
  });

  app.post("/api/tickets/close", requireUser, requireRole("admin"), (req, res) => {
    const id = String((req.body && req.body.id) || "");
    const raised = store.ticketRaiser(id);
    if (!raised || store.closeTicket(id, req.user.id) === "missing") {
      return res.status(404).json({ error: "No ticket with that ID." });
    }
    notifyUser(raised.raisedBy, "Your request was resolved by the support desk: " + raised.text);
    record(req.user, "ticket.close", id);
    res.json(publicState(req.user));
  });

  // One role asks another to accept something.
  app.post("/api/requests", requireUser, (req, res) => {
    const kind = String((req.body && req.body.kind) || "");
    const rule = Object.prototype.hasOwnProperty.call(REQUEST_KINDS, kind) ? REQUEST_KINDS[kind] : null;
    if (!rule) return res.status(404).json({ error: "No such kind of request." });
    const toRole = rule.toBy ? rule.toBy[req.user.role] : rule.to;
    if (rule.from ? req.user.role !== rule.from : !toRole) {
      return res.status(403).json({ error: "Your role cannot send this kind of request." });
    }
    let text = String((req.body && req.body.text) || "").trim();
    if (text.length < 3 || text.length > 300) {
      return res.status(400).json({ error: "Write between 3 and 300 characters." });
    }
    if (rule.dated) {
      const from = readableDateTime(req.body.from);
      const to = readableDateTime(req.body.to);
      if (!from || !to) return res.status(400).json({ error: "Give the from and to date and time." });
      if (String(req.body.to) <= String(req.body.from)) {
        return res.status(400).json({ error: "The end must be after the start." });
      }
      text += " · from " + from + " to " + to;
    }
    const request = {
      id: crypto.randomUUID().slice(0, 8),
      kind,
      text,
      fromUser: req.user.id,
      fromName: req.user.name,
      toRole,
      raisedAt: new Date().toISOString(),
    };
    store.addRequest(request);
    record(req.user, "request.raise", kind + " " + request.id);
    notifyRole(toRole, "New " + rule.label.toLowerCase() + " from " + req.user.name + ": " + text);
    res.status(201).json(publicState(req.user));
  });

  app.post("/api/requests/accept", requireUser, (req, res) => {
    const request = store.findRequest(String((req.body && req.body.id) || ""));
    if (!request) return res.status(404).json({ error: "No request with that ID." });
    const rule = REQUEST_KINDS[request.kind];
    if (req.user.role !== request.toRole) {
      return res.status(403).json({ error: "Only " + request.toRole + " can accept this." });
    }
    if (rule.needsReady && request.status === "open") {
      const ready = store.approvedStudents().includes(request.fromName) && store.feeStatus(request.fromName) === "paid";
      if (!ready) return res.status(409).json({ error: request.fromName + " is still on hold." });
    }
    if (store.acceptRequest(request.id, req.user.id) === "done") {
      record(req.user, "request.accept", request.kind + " " + request.id);
      if (rule.decision) store.addDecision(rule.decision, req.user.id);
      store.addNotification(request.fromUser, "Your " + rule.label.toLowerCase() + " was " + rule.accepted + " by " + req.user.name + ": " + request.text);
      if (rule.announce) notifyRole(rule.announce, "New from the alumni network (" + rule.label.toLowerCase() + "): " + request.text);
    }
    res.json(publicState(req.user));
  });

  // A single-step approval: syllabus, marks, certificate, hall ticket.
  app.post("/api/decisions", requireUser, (req, res) => {
    const key = String((req.body && req.body.key) || "");
    const rule = Object.prototype.hasOwnProperty.call(DECISIONS, key) ? DECISIONS[key] : null;
    if (!rule) return res.status(404).json({ error: "No such approval." });
    if (req.user.role !== rule.role) return res.status(403).json({ error: "Only " + rule.role + " can do this." });
    if (rule.needs && !store.decisions().includes(rule.needs)) {
      return res.status(409).json({ error: "An earlier step is still waiting." });
    }
    if (rule.needsReady) {
      const ready = store.approvedStudents().includes(rule.needsReady) && store.feeStatus(rule.needsReady) === "paid";
      if (!ready) return res.status(409).json({ error: rule.needsReady + " is still on hold." });
    }
    if (store.addDecision(key, req.user.id) === "done") {
      record(req.user, "decision", key);
      for (const [role, text] of rule.tell) notifyRole(role, text);
    }
    res.json(publicState(req.user));
  });

  app.post("/api/notifications/read", requireUser, (req, res) => {
    store.markNotificationsRead(req.user.id);
    res.json(publicState(req.user));
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
    res.json(publicState(req.user));
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
