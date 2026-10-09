const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../server");
const { createStore } = require("../store");

// Each test gets its own server with a fresh in-memory database.
async function start() {
  const server = createApp(createStore(null)).listen(0);
  const base = "http://localhost:" + server.address().port;
  const call = async (method, path, body, token) => {
    const response = await fetch(base + path, {
      method,
      headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
  const login = async (id) => (await call("POST", "/api/login", { id, password: "demo1234" })).body.token;
  return { call, login, stop: () => server.close() };
}

test("sign-in accepts the right password and rejects the wrong one", async () => {
  const api = await start();
  const good = await api.call("POST", "/api/login", { id: "saran", password: "demo1234" });
  assert.equal(good.status, 200);
  assert.equal(good.body.role, "staff");
  assert.ok(good.body.token.length >= 32);

  const bad = await api.call("POST", "/api/login", { id: "saran", password: "nope" });
  assert.equal(bad.status, 401);
  const unknown = await api.call("POST", "/api/login", { id: "nobody", password: "demo1234" });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, bad.body.error, "same message for wrong ID and wrong password");
  api.stop();
});

test("five wrong passwords lock the account for a while", async () => {
  const api = await start();
  for (let i = 0; i < 5; i += 1) await api.call("POST", "/api/login", { id: "devi", password: "x" });
  const locked = await api.call("POST", "/api/login", { id: "devi", password: "demo1234" });
  assert.equal(locked.status, 429);
  api.stop();
});

test("state needs a sign-in", async () => {
  const api = await start();
  assert.equal((await api.call("GET", "/api/state")).status, 401);
  api.stop();
});

test("only staff can approve an OD, and the student is notified", async () => {
  const api = await start();
  const student = await api.login("devi");
  const staff = await api.login("saran");

  const refused = await api.call("POST", "/api/od/approve", { student: "Devi" }, student);
  assert.equal(refused.status, 403);

  const approved = await api.call("POST", "/api/od/approve", { student: "Devi" }, staff);
  assert.equal(approved.status, 200);
  assert.deepEqual(approved.body.odApproved, ["Devi"]);

  const seen = await api.call("GET", "/api/state", null, student);
  assert.deepEqual(seen.body.odApproved, ["Devi"]);
  assert.equal(seen.body.notifications.length, 1);
  assert.match(seen.body.notifications[0].text, /OD request was approved by Saran/);
  assert.equal(seen.body.notifications[0].read, false);

  const read = await api.call("POST", "/api/notifications/read", null, student);
  assert.equal(read.body.notifications[0].read, true);
  api.stop();
});

test("only admin can record a fee, and it is written to the audit log", async () => {
  const api = await start();
  const staff = await api.login("saran");
  const admin = await api.login("admin");

  assert.equal((await api.call("POST", "/api/fees/pay", { student: "Devi" }, staff)).status, 403);
  const paid = await api.call("POST", "/api/fees/pay", { student: "Devi" }, admin);
  assert.equal(paid.body.feePaid, true);

  const audit = await api.call("GET", "/api/audit", null, admin);
  assert.equal(audit.body[0].action, "fee.pay");
  assert.equal(audit.body[0].user, "admin");
  assert.equal((await api.call("GET", "/api/audit", null, staff)).status, 403);
  api.stop();
});

test("reset puts the records back and keeps the users", async () => {
  const api = await start();
  const staff = await api.login("saran");
  await api.call("POST", "/api/od/approve", { student: "Devi" }, staff);
  const reset = await api.call("POST", "/api/reset", null, staff);
  assert.deepEqual(reset.body, { odApproved: [], feePaid: false, tickets: [], requests: [], covering: [], decisions: [], notifications: [] });
  assert.ok(await api.login("saran"));
  api.stop();
});

test("a student raises a query, the admin sees it and only the admin can close it", async () => {
  const api = await start();
  const student = await api.login("devi");
  const admin = await api.login("admin");

  const tooShort = await api.call("POST", "/api/tickets", { text: "a" }, student);
  assert.equal(tooShort.status, 400);

  const raised = await api.call("POST", "/api/tickets", { text: "Bus pass renewal date?", owner: "Accounts" }, student);
  assert.equal(raised.status, 201);
  const ticket = raised.body.tickets[0];
  assert.equal(ticket.raisedBy, "Devi");
  assert.equal(ticket.owner, "Accounts");
  assert.equal(ticket.status, "open");

  const seen = await api.call("GET", "/api/state", null, admin);
  assert.equal(seen.body.tickets.length, 1);

  assert.equal((await api.call("POST", "/api/tickets/close", { id: ticket.id }, student)).status, 403);
  const closed = await api.call("POST", "/api/tickets/close", { id: ticket.id }, admin);
  assert.equal(closed.body.tickets[0].status, "closed");
  api.stop();
});

test("records come from the server and need a sign-in", async () => {
  const api = await start();
  assert.equal((await api.call("GET", "/api/records")).status, 401);
  const staff = await api.login("saran");
  const records = await api.call("GET", "/api/records", null, staff);
  assert.equal(records.body.courses.length, 5);
  assert.equal(records.body.odRequests[0].student, "Devi");
  assert.equal(records.body.desks, undefined, "desk figures are for the office only");
  const admin = await api.login("admin");
  assert.equal((await api.call("GET", "/api/records", null, admin)).body.desks.length, 4);
  api.stop();
});

test("records are kept in the database file across a restart", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hacknext-")), "test.db");

  const first = createStore(file);
  assert.equal(first.approveOd("Devi", "saran"), "done");
  first.addTicket({ id: "t1", text: "Bus pass", owner: "Support desk", raisedBy: "Devi", status: "open", raisedAt: "2026-10-08T00:00:00Z" });
  first.close();

  const second = createStore(file);
  assert.deepEqual(second.approvedStudents(), ["Devi"]);
  assert.equal(second.tickets().length, 1);
  assert.equal(second.findUser("devi").role, "student", "users are not created twice");
  second.reset();
  assert.deepEqual(second.approvedStudents(), []);
  assert.equal(second.courses().length, 5);
  second.close();
});

test("each sign-in gets only its own share of the records", async () => {
  const api = await start();
  const student = await api.login("devi");
  const staff = await api.login("saran");
  const alumni = await api.login("alumni");
  const admin = await api.login("admin");

  // a student sees only her own OD request, not her classmates'
  const mine = await api.call("GET", "/api/records", null, student);
  assert.deepEqual(mine.body.odRequests.map((item) => item.student), ["Devi"]);
  assert.equal((await api.call("GET", "/api/records", null, staff)).body.odRequests.length, 3);
  assert.deepEqual((await api.call("GET", "/api/records", null, alumni)).body, {});

  // a ticket is visible to the person who raised it and to the office, nobody else
  await api.call("POST", "/api/tickets", { text: "Projector in Lab 2" }, staff);
  assert.equal((await api.call("GET", "/api/state", null, student)).body.tickets.length, 0);
  assert.equal((await api.call("GET", "/api/state", null, staff)).body.tickets.length, 1);
  assert.equal((await api.call("GET", "/api/state", null, admin)).body.tickets.length, 1);
  api.stop();
});

test("every acceptance notifies the people it concerns", async () => {
  const api = await start();
  const student = await api.login("devi");
  const staff = await api.login("saran");
  const admin = await api.login("admin");
  const coe = await api.login("brundha");
  const notes = async (token) => (await api.call("GET", "/api/state", null, token)).body.notifications.map((n) => n.text);

  const raised = await api.call("POST", "/api/tickets", { text: "Bus pass renewal date?" }, student);
  assert.match((await notes(admin))[0], /New request from Devi/);
  await api.call("POST", "/api/tickets/close", { id: raised.body.tickets[0].id }, admin);
  assert.match((await notes(student))[0], /resolved by the support desk/);

  await api.call("POST", "/api/od/approve", { student: "Devi" }, staff);
  assert.equal((await notes(coe)).length, 0, "not ready until the fee is paid as well");
  await api.call("POST", "/api/fees/pay", { student: "Devi" }, admin);
  assert.match((await notes(coe))[0], /Devi is now eligible/);
  assert.match((await notes(student))[0], /hall ticket is ready/);
  assert.equal((await notes(staff)).length, 0, "staff are not sent other people's messages");
  api.stop();
});

test("the COE verifies marks, the admin issues, and the alumnus is told at each step", async () => {
  const api = await start();
  const coe = await api.login("brundha");
  const admin = await api.login("admin");
  const alumni = await api.login("alumni");
  const student = await api.login("devi");
  const state = async (token) => (await api.call("GET", "/api/state", null, token)).body;

  // the admin cannot issue before the COE has verified, and cannot verify at all
  assert.equal((await api.call("POST", "/api/decisions", { key: "cert.lakshmi.issue" }, admin)).status, 409);
  assert.equal((await api.call("POST", "/api/decisions", { key: "cert.lakshmi" }, admin)).status, 403);
  assert.equal((await api.call("POST", "/api/decisions", { key: "nothing" }, coe)).status, 404);

  assert.equal((await api.call("POST", "/api/decisions", { key: "cert.lakshmi" }, coe)).status, 200);
  assert.match((await state(admin)).notifications[0].text, /ready to issue/);
  assert.match((await state(alumni)).notifications[0].text, /verified your marks/);

  await api.call("POST", "/api/decisions", { key: "cert.lakshmi.issue" }, admin);
  const after = await state(alumni);
  assert.deepEqual(after.decisions, ["cert.lakshmi", "cert.lakshmi.issue"]);
  assert.match(after.notifications[0].text, /has been issued/);
  assert.deepEqual((await state(student)).decisions, [], "a student is not shown certificate approvals");

  // a hall ticket cannot be issued while the student is on hold
  assert.equal((await api.call("POST", "/api/decisions", { key: "hallticket.devi" }, coe)).status, 409);
  api.stop();
});

test("a new OD request reaches staff, and approving it notifies the student", async () => {
  const api = await start();
  const student = await api.login("devi");
  const staff = await api.login("saran");
  const admin = await api.login("admin");
  const state = async (token) => (await api.call("GET", "/api/state", null, token)).body;

  assert.equal((await api.call("POST", "/api/requests", { kind: "od", text: "x" }, student)).status, 400);
  assert.equal((await api.call("POST", "/api/requests", { kind: "od", text: "Symposium" }, student)).status, 400, "dates are required");
  const backwards = { kind: "od", text: "Symposium", from: "2026-10-12T13:00", to: "2026-10-12T09:00" };
  assert.equal((await api.call("POST", "/api/requests", backwards, student)).status, 400, "end before start");
  const notADate = { kind: "od", text: "Symposium", from: "tomorrow", to: "2026-10-12T09:00" };
  assert.equal((await api.call("POST", "/api/requests", notADate, student)).status, 400);
  assert.equal((await api.call("POST", "/api/requests", { kind: "od", text: "Symposium" }, staff)).status, 403);
  assert.equal((await api.call("POST", "/api/requests", { kind: "nothing", text: "Symposium" }, student)).status, 404);

  const sent = await api.call("POST", "/api/requests", { kind: "od", text: "Symposium at NIT Trichy", from: "2026-10-12T09:00", to: "2026-10-12T13:00" }, student);
  assert.equal(sent.status, 201);
  assert.equal(sent.body.requests[0].text, "Symposium at NIT Trichy · from 12 Oct 2026, 09:00 to 12 Oct 2026, 13:00");
  assert.equal(sent.body.requests[0].status, "open");
  const id = sent.body.requests[0].id;

  const inbox = await state(staff);
  assert.equal(inbox.requests.length, 1);
  assert.match(inbox.notifications[0].text, /New od request from Devi/);
  assert.equal((await state(admin)).requests.length, 0, "the office is not sent OD requests");

  assert.equal((await api.call("POST", "/api/requests/accept", { id }, student)).status, 403);
  assert.equal((await api.call("POST", "/api/requests/accept", { id }, admin)).status, 403);
  const accepted = await api.call("POST", "/api/requests/accept", { id }, staff);
  assert.equal(accepted.body.requests[0].status, "accepted");

  const after = await state(student);
  assert.equal(after.requests[0].status, "accepted");
  assert.match(after.notifications[0].text, /Your od request was approved by Saran/);
  api.stop();
});

test("an alumni referral is published by the admin and students are told", async () => {
  const api = await start();
  const alumni = await api.login("alumni");
  const admin = await api.login("admin");
  const student = await api.login("devi");
  const state = async (token) => (await api.call("GET", "/api/state", null, token)).body;

  const sent = await api.call("POST", "/api/requests", { kind: "referral", text: "Junior developer, Chennai" }, alumni);
  await api.call("POST", "/api/requests/accept", { id: sent.body.requests[0].id }, admin);
  assert.match((await state(alumni)).notifications[0].text, /job referral was published by Admin/);
  assert.match((await state(student)).notifications[0].text, /alumni network/);
  assert.equal((await state(student)).requests.length, 0);
  api.stop();
});

test("a request goes to the sender's own superior, and only that role can accept it", async () => {
  const api = await start();
  const tokens = {};
  for (const id of ["devi", "saran", "brundha", "admin", "alumni"]) tokens[id] = await api.login(id);
  const state = async (id) => (await api.call("GET", "/api/state", null, tokens[id])).body;
  const ask = (id, text) => api.call("POST", "/api/requests", { kind: "general", text }, tokens[id]);

  assert.equal((await ask("devi", "Bonafide letter for a bank loan")).body.requests[0].toRole, "staff");
  assert.equal((await ask("saran", "Extra lab slot for II MCA")).body.requests.at(-1).toRole, "coe");
  assert.equal((await ask("brundha", "Two more invigilators")).body.requests.at(-1).toRole, "admin");
  assert.equal((await ask("alumni", "Duplicate degree certificate")).body.requests.at(-1).toRole, "admin");
  assert.equal((await ask("admin", "Nobody above me")).status, 403);

  const forStaff = (await state("saran")).requests.find((item) => item.fromName === "Devi");
  assert.equal((await api.call("POST", "/api/requests/accept", { id: forStaff.id }, tokens.brundha)).status, 403);
  assert.equal((await api.call("POST", "/api/requests/accept", { id: forStaff.id }, tokens.saran)).status, 200);
  assert.match((await state("devi")).notifications[0].text, /Your request was accepted by Saran/);
  api.stop();
});

test("a hall ticket request is issued by the COE only once the student is clear", async () => {
  const api = await start();
  const student = await api.login("devi");
  const staff = await api.login("saran");
  const admin = await api.login("admin");
  const coe = await api.login("brundha");

  const sent = await api.call("POST", "/api/requests", { kind: "hallticket", text: "End semester examination" }, student);
  const id = sent.body.requests[0].id;
  assert.equal((await api.call("POST", "/api/requests/accept", { id }, coe)).status, 409);

  await api.call("POST", "/api/od/approve", { student: "Devi" }, staff);
  await api.call("POST", "/api/fees/pay", { student: "Devi" }, admin);
  assert.equal((await api.call("POST", "/api/requests/accept", { id }, coe)).status, 200);

  const after = (await api.call("GET", "/api/state", null, student)).body;
  assert.ok(after.decisions.includes("hallticket.devi"));
  assert.match(after.notifications[0].text, /hall ticket request was issued by Brundha/);
  api.stop();
});

test("a class can only be altered to a colleague who is free in that period", async () => {
  const api = await start();
  const saran = await api.login("saran");
  const raja = await api.login("raja");
  const gopika = await api.login("gopika");
  const admin = await api.login("admin");
  const state = async (token) => (await api.call("GET", "/api/state", null, token)).body;
  const alter = (token, date, period, colleague) => api.call("POST", "/api/requests", { kind: "duty", date, period, colleague }, token);

  // Monday 12 Oct 2026, period 1: Raja is teaching, Gopika is free
  const busy = await alter(saran, "2026-10-12", 1, "Raja");
  assert.equal(busy.status, 400);
  assert.match(busy.body.error, /Raja has a class in period 1/);
  assert.equal((await alter(saran, "2026-10-12", 2, "Gopika")).status, 400, "Saran has no class in period 2 on Monday");
  assert.equal((await alter(saran, "2026-10-11", 1, "Gopika")).status, 400, "Sunday");
  assert.equal((await alter(saran, "not a date", 1, "Gopika")).status, 400);
  assert.equal((await alter(saran, "2026-10-12", 1, "Someone Else")).status, 400);
  assert.equal((await alter(saran, "2026-10-12", 1, "Saran")).status, 400, "not to yourself");
  assert.equal((await alter(saran, "2026-10-12", 1, "Devi")).status, 400, "not to a student");
  assert.equal((await alter(saran, "2026-10-13", 2, "Raja")).status, 400, "Tuesday period 2: nobody is free");
  assert.equal((await alter(saran, "2026-10-13", 2, "Gopika")).status, 400);

  const ok = await alter(saran, "2026-10-12", 1, "Gopika");
  assert.equal(ok.status, 201);
  assert.equal(ok.body.requests[0].text, "Period 1 on Mon 12 Oct 2026 (Database Systems · II MCA) goes to Gopika, who is free in that period");
  assert.equal((await alter(saran, "2026-10-12", 1, "Gopika")).status, 409, "the same class cannot be altered twice");

  // Raja also teaches in period 1 on Monday; Gopika is now covering Saran's class
  const second = await alter(raja, "2026-10-12", 1, "Gopika");
  assert.equal(second.status, 400);
  assert.match(second.body.error, /already covering another class/);

  // only the colleague who was asked sees it and can accept it
  const id = ok.body.requests[0].id;
  assert.equal((await state(gopika)).requests.length, 1);
  assert.match((await state(gopika)).notifications[0].text, /New class alteration from Saran/);
  assert.equal((await state(raja)).requests.length, 0);
  assert.equal((await state(raja)).notifications.length, 0);
  assert.equal((await api.call("POST", "/api/requests/accept", { id }, raja)).status, 403);
  assert.equal((await api.call("POST", "/api/requests/accept", { id }, admin)).status, 403);
  assert.equal((await api.call("POST", "/api/requests/accept", { id }, gopika)).status, 200);

  assert.match((await state(saran)).notifications[0].text, /class alteration was accepted by Gopika/);
  assert.match((await state(admin)).notifications[0].text, /agreed between Saran and Gopika/);
  api.stop();
});

test("each staff member has their own timetable and sees who else is teaching", async () => {
  const api = await start();
  const raja = (await api.call("GET", "/api/records", null, await api.login("raja"))).body;
  assert.equal(raja.ownClasses.Mon[1], "Operating Systems · II MCA");
  assert.deepEqual(Object.keys(raja.colleagueBusy).sort(), ["Gopika", "Saran"]);
  assert.deepEqual(raja.colleagueBusy.Saran.Mon, [1, 3, 5, 7]);
  assert.equal(raja.inOut[0].in, "08:35", "Raja gets his own times, not Saran's");
  api.stop();
});

test("staff get their own in and out times, and nobody else does", async () => {
  const api = await start();
  const staff = await api.login("saran");
  const records = (await api.call("GET", "/api/records", null, staff)).body;
  assert.equal(records.inOut.length, 6);
  assert.deepEqual(records.inOut[0], { date: "2026-10-01", in: "08:48", out: "16:35" });
  assert.equal(records.inOut.at(-1).out, null, "today has no out time yet");
  for (const id of ["devi", "brundha", "admin", "alumni"]) {
    const other = (await api.call("GET", "/api/records", null, await api.login(id))).body;
    assert.equal(other.inOut, undefined);
  }
  api.stop();
});
