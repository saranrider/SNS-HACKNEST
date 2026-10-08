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

test("only staff can approve an OD, and every role then sees it", async () => {
  const api = await start();
  const student = await api.login("devi");
  const staff = await api.login("saran");

  const refused = await api.call("POST", "/api/od/approve", { student: "Devi" }, student);
  assert.equal(refused.status, 403);

  const approved = await api.call("POST", "/api/od/approve", { student: "Devi" }, staff);
  assert.equal(approved.status, 200);
  assert.deepEqual(approved.body.odApproved, ["Devi"]);

  const seen = await api.call("GET", "/api/state", null, student);
  assert.deepEqual(seen.body, { odApproved: ["Devi"], feePaid: false, tickets: [] });
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
  assert.deepEqual(reset.body, { odApproved: [], feePaid: false, tickets: [] });
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
  assert.equal(records.body.desks.length, 4);
  api.stop();
});
