// PSNA Hacknext - page behaviour.
// Every page loads this file; each section only runs if its container exists.

const MIN_ATTENDANCE = 0.75;
const DESK_COUNT = 4;

// The student whose record is followed across the five role pages.
const DEMO_STUDENT = "Devi";

// Actions are kept in the browser so that approving an OD request on the
// staff page, or recording a fee on the admin page, shows up on the others.
const STORE_KEY = "cms-demo-state";

// Demo accounts for the sign-in page. This is NOT real authentication:
// the check runs in the browser and the password is visible in this file.
// A real deployment must verify credentials on a server.
const DEMO_PASSWORD = "demo1234";
const SESSION_KEY = "cms-demo-session";

const accounts = [
  { id: "devi", role: "student", name: "Devi", title: "Student", page: "student.html", about: "Attendance, OD, no dues, hall ticket", image: "images/student.svg" },
  { id: "saran", role: "staff", name: "Saran", title: "Staff", page: "staff.html", about: "Approvals, attendance, question papers", image: "images/staff.svg" },
  { id: "raja", role: "staff", name: "Raja", title: "Staff", page: "staff.html", about: "Approvals, attendance, question papers", image: "images/staff.svg" },
  { id: "gopika", role: "staff", name: "Gopika", title: "Staff", page: "staff.html", about: "Approvals, attendance, question papers", image: "images/staff.svg" },
  { id: "brundha", role: "coe", name: "Brundha", title: "COE", page: "coe.html", about: "Syllabus, hall tickets, results", image: "images/coe.svg" },
  { id: "admin", role: "admin", name: "Admin", title: "Admin", page: "admin.html", about: "Fees, clearance, certificates", image: "images/admin.svg" },
  { id: "alumni", role: "alumni", name: "Alumni", title: "Alumni", page: "alumni.html", about: "Certificates, placement, community", image: "images/alumni.svg" },
];

function currentSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch (error) {
    return null;
  }
}

function signOut() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    // nothing stored
  }
  window.location.href = "index.html";
}

/* ---------- backend connection ---------- */

// When the pages are served by the server in /server, sign-in and the
// cross-role actions go through its API and every device sees the same
// records. Opened as plain files, or from a host with no server, the pages
// fall back to keeping everything in this browser.
const API_BASE = window.CMS_API_BASE || "";
const POLL_MS = 3000;
let backendOnline = false;
let actionsInFlight = 0;

async function connectBackend() {
  if (window.location.protocol === "file:" && !API_BASE) return false;
  try {
    const response = await fetch(API_BASE + "/api/health", { signal: AbortSignal.timeout(1500) });
    const body = await response.json();
    backendOnline = response.ok && body.ok === true;
  } catch (error) {
    backendOnline = false;
  }
  return backendOnline;
}

function apiToken() {
  const session = currentSession();
  return (session && session.token) || "";
}

async function api(method, path, body) {
  const response = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

// A page that was signed in before the server was reachable has no token:
// ask for a proper sign-in.
function ensureServerSession() {
  if (apiToken()) return true;
  signOut();
  return false;
}

// Copies the server's records into this browser. Returns true if they differ
// from what the page was showing.
async function pullState() {
  const response = await api("GET", "/api/state");
  if (response.status === 401) {
    signOut();
    return false;
  }
  if (!response.ok) return false;

  const fresh = JSON.stringify(response.data);
  const changed = JSON.stringify(loadState()) !== fresh;
  if (changed) {
    try {
      recordStore().setItem(STORE_KEY, fresh);
    } catch (error) {
      return false;
    }
  }
  return changed;
}

// The records the pages draw from. With a server they come from its
// database; without one, the sample values further down this file are used.
async function pullRecords() {
  const response = await api("GET", "/api/records");
  if (!response.ok) return;
  const replace = (target, fresh) => {
    if (Array.isArray(fresh)) target.splice(0, target.length, ...fresh);
  };
  replace(courses, response.data.courses);
  replace(odRequests, response.data.odRequests);
  replace(desks, response.data.desks);
  replace(staffInOut, response.data.inOut);
  if (response.data.ownClasses) Object.assign(ownClasses, response.data.ownClasses);
  if (response.data.colleagueBusy) Object.assign(colleagueBusy, response.data.colleagueBusy);
}

// Sends an action to the server. The page has already shown the result, so
// if the server refuses, the page reloads with the server's version.
async function sendAction(path, body) {
  if (!backendOnline) return;
  actionsInFlight += 1;
  const response = await api("POST", path, body).catch(() => ({ ok: false, data: {} }));
  actionsInFlight -= 1;
  if (response.ok) {
    // keep exactly what the server now holds, then redraw anything that lists it
    try {
      recordStore().setItem(STORE_KEY, JSON.stringify(response.data));
    } catch (error) {
      // the next poll will bring it in
    }
    renderTickets();
    renderRequests();
    renderNotifications();
    return;
  }
  await pullState();
  window.alert("The server did not accept that: " + (response.data.error || "no connection"));
  window.location.reload();
}

// True while the person is in the middle of writing something a reload
// would throw away: the cursor is in a field, or a field has unsent text.
function midEntry() {
  const active = document.activeElement;
  if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return true;
  return Array.from(document.querySelectorAll("input[type=text], input[type=search], input[type=datetime-local], input[type=date], textarea")).some(
    (field) => field.offsetParent !== null && field.value !== field.defaultValue
  );
}

// Shows a change made by someone else. Normally the page reloads; if that
// would lose what is being typed, the parts that can be redrawn in place
// are, and the reload waits until the person has finished.
let reloadWaiting = false;
function showChange() {
  if (!midEntry()) {
    window.location.reload();
    return;
  }
  reloadWaiting = true;
  renderTickets();
  renderRequests();
  renderApprovals();
  renderHallTickets();
  renderOverview();
  renderNotifications();
}

// Picks up changes made on other devices.
function startPolling() {
  setInterval(async () => {
    if (actionsInFlight > 0) return;
    if ((await pullState()) || reloadWaiting) showChange();
  }, POLL_MS);
}

function showBackendStatus() {
  const foot = document.querySelector(".page-foot");
  if (!foot) return;
  const text = backendOnline
    ? "Connected to the server: records are shared across devices."
    : "No server found: records are kept in this browser only.";
  foot.append(el("span", "backend-status" + (backendOnline ? " online" : ""), text));
}

// With a server, each role is sent only its own share of the records, so a
// copy is kept per tab. Without one, the copy is shared by the whole browser
// so that one role's action is there when the next role signs in.
function recordStore() {
  return backendOnline ? sessionStorage : localStorage;
}

function loadState() {
  const state = { odApproved: [], feePaid: false, tickets: [], requests: [], covering: [], decisions: [], notifications: [] };
  try {
    Object.assign(state, JSON.parse(recordStore().getItem(STORE_KEY)) || {});
  } catch (error) {
    // storage blocked or corrupted: carry on with the defaults
  }
  return state;
}

function saveState(state) {
  try {
    recordStore().setItem(STORE_KEY, JSON.stringify(state));
  } catch (error) {
    // the page still works for this visit, it just will not carry over
  }
}

// Sample records. Replace with data from the college's timetable and
// attendance exports once the backend is connected.
const courses = [
  { code: "MC1301", name: "Data Structures", held: 40, attended: 33 },
  { code: "MC1302", name: "Database Systems", held: 42, attended: 30 },
  { code: "MC1337", name: "Digital Marketing", held: 36, attended: 27 },
  { code: "MC1304", name: "Operating Systems", held: 38, attended: 29 },
  { code: "MC1305", name: "Software Engineering", held: 40, attended: 27 },
];

const odRequests = [
  {
    student: "Devi",
    event: "Internal hackathon · 6 Oct",
    periods: 6,
    attended: 146,
    held: 196,
    byCourse: { MC1302: 3, MC1305: 3 }, // periods missed in each course
  },
  { student: "Divya S", event: "Zonal volleyball · 5 Oct", periods: 7, attended: 150, held: 196 },
  { student: "Arun P", event: "Placement drive · 7 Oct", periods: 4, attended: 158, held: 196 },
];

const blueprint = {
  marksPerUnit: 20,
  units: [
    { name: "Unit I", marks: 20 },
    { name: "Unit II", marks: 28 },
    { name: "Unit III", marks: 20 },
    { name: "Unit IV", marks: 12 },
    { name: "Unit V", marks: 20 },
  ],
};

const desks = [
  { name: "Library", autoCleared: 41, open: 2, waitDays: 0.4 },
  { name: "Laboratory", autoCleared: 44, open: 1, waitDays: 0.3 },
  { name: "Hostel", autoCleared: 18, open: 3, waitDays: 1.2 },
  { name: "Accounts", autoCleared: 36, open: 6, waitDays: 2.6 },
];

// Projects completed by earlier batches. A new proposal is compared with these.
const pastProjects = [
  {
    title: "Smart attendance system using face recognition",
    year: 2024,
    team: "Batch 6, MCA 2022-24",
    guide: "Saran",
    summary:
      "Classroom camera images are used to detect and recognise student faces with a deep learning model and mark attendance for each period.",
    done: ["Face detection and recognition model", "Attendance marked for one classroom"],
    remaining: ["Works poorly in low light", "Not linked to the college attendance record", "No check against proxy photos"],
    files: ["Project report", "Source code", "Face image dataset"],
  },
  {
    title: "Crop disease detection from leaf images",
    year: 2025,
    team: "Batch 3, MCA 2023-25",
    guide: "Mr. Ravi T",
    summary:
      "A convolutional neural network classifies leaf photographs into healthy and diseased classes for paddy and tomato crops.",
    done: ["Trained classifier for two crops", "Android demo app"],
    remaining: ["More crops", "Offline use in the field"],
    files: ["Project report", "Source code", "Leaf image dataset"],
  },
  {
    title: "Library book recommendation using borrowing history",
    year: 2023,
    team: "Batch 9, MCA 2021-23",
    guide: "Ms. Shalini G",
    summary:
      "Collaborative filtering on library borrowing records suggests books to students based on what similar readers borrowed.",
    done: ["Recommendation model", "Web page for suggestions"],
    remaining: ["Cold start for new students", "Link to live library data"],
    files: ["Project report", "Source code"],
  },
];

// A proposal at or above this similarity is treated as the same project.
const MATCH_THRESHOLD = 0.4;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "using", "based", "system", "are", "was", "that", "this",
  "into", "each", "what", "used", "use", "student", "students", "project", "model", "automatically",
]);

function keywords(text) {
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const kept = words
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .map((word) => word.replace(/(ing|ed|es|s)$/, ""));
  return new Set(kept);
}

// Share of the smaller keyword set that also appears in the other one (0 to 1).
function similarity(textA, textB) {
  const a = keywords(textA);
  const b = keywords(textB);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((word) => {
    if (b.has(word)) shared += 1;
  });
  return shared / Math.min(a.size, b.size);
}

function closestProject(title, abstract) {
  const proposal = title + " " + abstract;
  let best = null;
  pastProjects.forEach((project) => {
    const score = similarity(proposal, project.title + " " + project.summary);
    if (!best || score > best.score) best = { project, score };
  });
  return best;
}

function percent(attended, held) {
  return ((attended / held) * 100).toFixed(1) + "%";
}

// How many more periods a student can miss and still stay at the minimum.
function periodsCanMiss(attended, held) {
  return Math.floor(attended / MIN_ATTENDANCE - held);
}

// How many periods in a row a student must attend to get back to the minimum.
function periodsToRecover(attended, held) {
  return Math.ceil((MIN_ATTENDANCE * held - attended) / (1 - MIN_ATTENDANCE));
}

function shortageStatus(course) {
  if (course.attended / course.held < MIN_ATTENDANCE) {
    return { text: "Attend next " + periodsToRecover(course.attended, course.held), kind: "stop" };
  }
  const spare = periodsCanMiss(course.attended, course.held);
  if (spare > 0) {
    return { text: "Can miss " + spare + " more", kind: "ok" };
  }
  return { text: "Cannot miss any", kind: "wait" };
}

// Builds the demo student's current position from the sample data plus
// whatever has been approved or paid so far.
function studentRecord(state) {
  const request = odRequests.find((item) => item.student === DEMO_STUDENT);
  const odApproved = state.odApproved.includes(DEMO_STUDENT);

  const list = courses.map((course) => {
    const credited = odApproved ? request.byCourse[course.code] || 0 : 0;
    return Object.assign({}, course, { attended: course.attended + credited });
  });
  const held = list.reduce((sum, course) => sum + course.held, 0);
  const attended = list.reduce((sum, course) => sum + course.attended, 0);

  return {
    courses: list,
    held,
    attended,
    odApproved,
    odPeriods: request.periods,
    attendanceOk: attended / held >= MIN_ATTENDANCE,
    desksCleared: state.feePaid ? DESK_COUNT : DESK_COUNT - 1,
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

// Sets an element's classes and, when given, its text in one go.
function setStatus(id, baseClass, kind, text) {
  const node = document.getElementById(id);
  if (!node) return;
  node.className = (baseClass + " " + kind).trim();
  if (text !== undefined) node.textContent = text;
}

/* ---------- student: attendance follow-up ---------- */

function renderAttendance() {
  const body = document.getElementById("attendance-rows");
  if (!body) return;

  const record = studentRecord(loadState());

  record.courses.forEach((course) => {
    const row = el("tr");
    const name = el("td");
    name.append(el("span", "mono muted", course.code), " " + course.name);
    row.append(name);
    row.append(el("td", "mono", course.held));
    row.append(el("td", "mono", course.attended));
    row.append(el("td", "mono", percent(course.attended, course.held)));

    const status = shortageStatus(course);
    const cell = el("td");
    cell.append(el("span", "pill " + status.kind, status.text));
    row.append(cell);
    body.append(row);
  });

  renderStudentStatus(record);
}

// The attendance meter is zoomed to this range so that small gaps around
// the 75% line are visible.
const METER_MIN = 60;
const METER_MAX = 90;

function meterPosition(attended, held) {
  const value = (attended / held) * 100;
  const share = ((value - METER_MIN) / (METER_MAX - METER_MIN)) * 100;
  return Math.max(0, Math.min(100, share));
}

function renderAttendanceMeter(record) {
  const fill = document.getElementById("att-fill");
  const ghost = document.getElementById("att-ghost");
  if (!fill || !ghost) return;

  const current = meterPosition(record.attended, record.held);
  fill.style.width = current + "%";
  fill.classList.toggle("low", !record.attendanceOk);
  fill.parentElement.classList.toggle("low", !record.attendanceOk);

  // The striped part shows what a pending OD request would add.
  ghost.hidden = record.odApproved;
  if (!record.odApproved) {
    const after = meterPosition(record.attended + record.odPeriods, record.held);
    ghost.style.left = current + "%";
    ghost.style.width = after - current + "%";
  }
}

// Readiness panel, OD tracker, no dues and hall ticket for the student page.
function renderStudentStatus(record) {
  const now = percent(record.attended, record.held);
  const short = Math.ceil(MIN_ATTENDANCE * record.held - record.attended);
  const duesDone = record.desksCleared === DESK_COUNT;
  const desksText = record.desksCleared + " of " + DESK_COUNT + " desks";

  setText("overall-attendance", now);
  if (record.attendanceOk) {
    setStatus("overall-hint", "hint", "", "Above the 75% rule");
  } else {
    setStatus("overall-hint", "hint", "stop", short + " period short of 75%");
  }

  if (record.odApproved) {
    setStatus("od-hint", "hint", "", "OD approved · " + record.odPeriods + " periods credited");
    setStatus("step-approval", "", "done");
    setStatus("step-updated", "", "done");
    setText("step-approval-label", "Step 3 · Done");
    setText("step-updated-label", "Step 4 · Done");
    setText(
      "od-note",
      "Approved. " + record.odPeriods + " periods were marked OD and your overall attendance is now " + now + "."
    );
  } else {
    const after = percent(record.attended + record.odPeriods, record.held);
    setStatus("od-hint", "hint", "wait", "OD request waiting with staff · would take you to " + after);
    setStatus("step-approval", "", "current");
    setStatus("step-updated", "", "");
    setText("step-approval-label", "Step 3 · 1 day waiting");
    setText("step-updated-label", "Step 4 · Automatic");
    setText(
      "od-note",
      "On approval, " + record.odPeriods + " periods are marked OD and your overall attendance moves from " +
        now + " to " + after + "."
    );
  }

  renderAttendanceMeter(record);

  setText("dues-count", record.desksCleared + " / " + DESK_COUNT);
  setStatus("desk-accounts", "", duesDone ? "cleared" : "");
  setStatus("dues-hint", "hint", duesDone ? "" : "wait", duesDone ? "All desks cleared" : "Accounts desk pending");
  setStatus("accounts-pill", "pill", duesDone ? "ok" : "wait", duesDone ? "Cleared on payment" : "Fee balance pending");

  setStatus("ht-attendance", "pill", record.attendanceOk ? "ok" : "stop", record.attendanceOk ? "Eligible" : "Below 75%");
  setStatus("ht-dues", "pill", duesDone ? "ok" : "wait", desksText);

  const blocked = (record.attendanceOk ? 0 : 1) + (duesDone ? 0 : 1);
  const lines = [
    "You are clear. Your hall ticket is ready to issue.",
    "One thing stands between you and your hall ticket.",
    "Two things stand between you and your hall ticket.",
  ];
  setText("hero-line", lines[blocked]);
  setStatus("ticket", "ticket", blocked === 0 ? "ready" : "");

  if (blocked === 0) {
    const issued = loadState().decisions.includes("hallticket.devi");
    if (issued) setText("hero-line", "You are clear. Your hall ticket has been issued.");
    setText("ht-status", issued ? "Issued" : "Ready to issue");
    setStatus("ht-hint", "hint", "", issued ? "Issued by the COE" : "Both conditions met · waiting for the COE to issue");
  } else {
    setText("ht-status", "On hold");
    setStatus("ht-hint", "hint", "stop", blocked + (blocked === 1 ? " condition" : " conditions") + " not met");
  }
}

/* ---------- student: project follow-up ---------- */

function bulletList(items) {
  const list = el("ul", "plain-list");
  items.forEach((item) => list.append(el("li", "", item)));
  return list;
}

function showNewProject(result, score) {
  result.append(el("span", "pill ok", "No earlier project matches"));
  result.append(
    el(
      "p",
      "note",
      "Closest earlier project is only " + Math.round(score * 100) + "% similar. " +
        "Your proposal is registered as a new project and sent to your guide."
    )
  );
}

function showMatchedProject(result, match, imageUrl) {
  const project = match.project;

  result.append(el("span", "pill wait", Math.round(match.score * 100) + "% match with an earlier project"));
  result.append(el("h3", "match-title", project.title));
  result.append(el("p", "muted", project.year + " · " + project.team + " · Guide: " + project.guide));

  result.append(el("div", "section-label", "Already done"));
  result.append(bulletList(project.done));
  result.append(el("div", "section-label", "Left for you to continue"));
  result.append(bulletList(project.remaining));

  result.append(el("div", "section-label", "Access given to you"));
  project.files.forEach((file) => {
    const row = el("div", "row");
    row.append(el("span", "", file), el("span", "pill ok", "Unlocked"));
    result.append(row);
  });

  const footer = el("div", "actions");
  const button = el("button", "btn", "Continue this project");
  button.type = "button";
  button.addEventListener("click", () => {
    const done = el("div", "notice");
    done.append(
      el("strong", "", "Continuation registered. "),
      "Your graphical abstract is attached and the request is with " + project.guide + " for approval."
    );
    if (imageUrl) {
      const image = el("img", "abstract-preview");
      image.src = imageUrl;
      image.alt = "Your graphical abstract";
      done.append(image);
    }
    footer.replaceWith(done);
  });
  footer.append(button, el("span", "muted", "This topic cannot be registered again as a new project."));
  result.append(footer);
}

function setUpProjectCheck() {
  const form = document.getElementById("project-form");
  if (!form) return;

  const title = document.getElementById("project-title");
  const abstract = document.getElementById("project-abstract");
  const fileInput = document.getElementById("project-image");
  const preview = document.getElementById("project-preview");
  const error = document.getElementById("project-error");
  const result = document.getElementById("project-result");
  let imageUrl = null;

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = file ? URL.createObjectURL(file) : null;
    preview.hidden = !file;
    if (file) preview.src = imageUrl;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    error.textContent = "";

    if (!title.value.trim() || !abstract.value.trim()) {
      error.textContent = "Enter the project title and abstract.";
      return;
    }
    if (!fileInput.files[0]) {
      error.textContent = "Add your graphical abstract before comparing.";
      return;
    }

    const match = closestProject(title.value, abstract.value);
    result.replaceChildren(el("div", "section-label", "Result"));
    if (match.score >= MATCH_THRESHOLD) {
      showMatchedProject(result, match, imageUrl);
    } else {
      showNewProject(result, match.score);
    }
  });
}

/* ---------- staff: OD approvals ---------- */

function renderOdApprovals() {
  const body = document.getElementById("od-rows");
  if (!body) return;

  const state = loadState();

  odRequests.forEach((request) => {
    const before = percent(request.attended, request.held);
    const after = percent(request.attended + request.periods, request.held);

    const row = el("tr");
    row.append(el("td", "", request.student));
    row.append(el("td", "", request.event));
    row.append(el("td", "mono", request.periods));
    row.append(el("td", "mono", before + " → " + after));

    const action = el("td");
    const showApproved = () => {
      action.replaceChildren(el("span", "pill ok", "Approved · record updated"));
    };

    if (state.odApproved.includes(request.student)) {
      showApproved();
    } else {
      const button = el("button", "btn", "Approve");
      button.type = "button";
      button.addEventListener("click", () => {
        // read again: other roles may have acted since this row was drawn
        const state = loadState();
        if (state.odApproved.includes(request.student)) return;
        state.odApproved.push(request.student);
        if (request.student === DEMO_STUDENT) {
          addNote(state, "student", "Your OD request was approved by " + currentUserName() + ". Your attendance has been updated.");
          noteIfReady(state);
        }
        saveState(state);
        showApproved();
        renderOverview();
        sendAction("/api/od/approve", { student: request.student });
      });
      action.append(button);
    }
    row.append(action);
    body.append(row);
  });
}

/* ---------- staff: blueprint checker ---------- */

function renderBlueprint() {
  const list = document.getElementById("unit-bars");
  if (!list) return;

  const target = blueprint.marksPerUnit;
  const scale = target * 1.5; // leaves room on the bar for units that go over

  blueprint.units.forEach((unit) => {
    const ok = unit.marks === target;
    const row = el("div", "unit-row");
    row.append(el("span", "", unit.name));

    const bar = el("span", "bar");
    const fill = el("span", ok ? "" : "bad");
    fill.style.width = Math.min(100, (unit.marks / scale) * 100) + "%";
    bar.append(fill);
    row.append(bar);

    let label = unit.marks + " of " + target;
    if (!ok) label += unit.marks > target ? " · over" : " · short";
    row.append(el("span", "mono" + (ok ? "" : " text-stop"), label));
    list.append(row);
  });
}

/* ---------- admin: where no-dues requests are waiting ---------- */

function renderDesks() {
  const body = document.getElementById("desk-rows");
  if (!body) return;

  body.replaceChildren();

  // A recorded fee payment closes one request at the accounts desk.
  const feePaid = loadState().feePaid;
  const list = desks.map((desk) =>
    desk.name === "Accounts" && feePaid ? Object.assign({}, desk, { open: desk.open - 1 }) : desk
  );

  const slowest = list.reduce((a, b) => (b.waitDays > a.waitDays ? b : a));

  list.forEach((desk) => {
    const row = el("tr");
    row.append(el("td", "", desk.name));
    row.append(el("td", "mono", desk.autoCleared));
    row.append(el("td", "mono", desk.open));

    const cell = el("td");
    const wrap = el("span", "wait-cell");
    const bar = el("span", "bar");
    const fill = el("span", desk === slowest ? "bad" : "");
    fill.style.width = (desk.waitDays / slowest.waitDays) * 100 + "%";
    bar.append(fill);
    wrap.append(bar, el("span", "mono", desk.waitDays.toFixed(1)));
    cell.append(wrap);
    row.append(cell);
    body.append(row);
  });
}

/* ---------- admin: fee follow-up ---------- */

function renderFees() {
  const slot = document.getElementById("fee-devi");
  if (!slot) return;

  const state = loadState();
  const showPaid = () => {
    slot.replaceChildren(el("span", "pill ok", "Paid · accounts desk cleared"));
  };

  if (state.feePaid) {
    showPaid();
    return;
  }

  const button = el("button", "btn outline", "Record payment");
  button.type = "button";
  button.addEventListener("click", () => {
    const state = loadState(); // read again: other roles may have acted since
    state.feePaid = true;
    addNote(state, "student", "Your fee payment was recorded. The accounts desk has cleared your dues.");
    noteIfReady(state);
    saveState(state);
    showPaid();
    renderDesks();
    renderOverview();
    sendAction("/api/fees/pay", { student: DEMO_STUDENT });
  });
  slot.append(el("strong", "text-stop", "Exam fee due · blocks hall ticket"), button);
}

/* ---------- COE: hall ticket eligibility ---------- */

function renderHallTickets() {
  if (!document.getElementById("coe-status")) return;

  const record = studentRecord(loadState());
  const duesDone = record.desksCleared === DESK_COUNT;

  const reasons = [];
  if (!record.attendanceOk) reasons.push(record.odApproved ? "below 75%" : "OD pending");
  if (!duesDone) reasons.push("fee due");
  const onHold = reasons.length > 0;

  setStatus("coe-attendance", "mono", record.attendanceOk ? "" : "text-stop", percent(record.attended, record.held));
  setStatus("coe-dues", "", duesDone ? "" : "text-wait", record.desksCleared + " of " + DESK_COUNT + " desks");
  const issued = loadState().decisions.includes("hallticket.devi");
  const ready = issued ? "Issued" : "Ready to issue";
  setStatus("coe-status", "pill", onHold ? "stop" : "ok", onHold ? "On hold · " + reasons.join(", ") : ready);
}

/* ---------- sign in and page access ---------- */

// Each dashboard declares its role on <body data-role>. Visitors who are
// not signed in with that role are sent back to the sign-in page.
function guardPage() {
  const role = document.body.dataset.role;
  if (!role) return true;

  const slot = document.getElementById("session");

  const session = currentSession();
  if (!session || session.role !== role) {
    window.location.replace("index.html");
    return false;
  }

  if (slot) {
    const button = el("button", "btn outline", "Sign out");
    button.type = "button";
    button.addEventListener("click", async () => {
      if (backendOnline) await api("POST", "/api/logout").catch(() => null);
      signOut();
    });
    // "Admin · Admin" would read oddly, so the role is added only when it differs
    const label = session.name === session.title ? session.name : session.name + " · " + session.title;
    const avatar = el("img", "session-avatar");
    avatar.src = accounts.find((item) => item.role === role).image;
    avatar.alt = "";
    slot.append(avatar, el("span", "session-user", label), button);
  }
  return true;
}

function setUpLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  const userId = document.getElementById("login-id");
  const password = document.getElementById("login-password");
  const error = document.getElementById("login-error");
  const list = document.getElementById("demo-accounts");

  // the portal picked in step 1; a sign-in for any other role is refused
  let chosenRole = "";

  const oneForEachRole = accounts.filter((account, index) => accounts.findIndex((item) => item.role === account.role) === index);
  oneForEachRole.forEach((account) => {
    const button = el("button", "role-tile");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    const picture = el("img", "role-image");
    picture.src = account.image;
    picture.alt = ""; // decorative: the role name is right below it
    button.append(
      picture,
      el("strong", "", account.title),
      el("span", "", account.about)
    );
    button.addEventListener("click", () => {
      chosenRole = account.role;
      error.textContent = "";
      userId.focus();
      list.querySelectorAll(".role-tile").forEach((tile) => {
        const chosen = tile === button;
        tile.classList.toggle("selected", chosen);
        tile.setAttribute("aria-pressed", chosen);
      });
    });
    list.append(button);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const typed = userId.value.trim().toLowerCase();
    if (!chosenRole) {
      error.textContent = "Choose who is signing in first.";
      return;
    }
    const wrongPortal =
      "This account does not belong to the " + accounts.find((item) => item.role === chosenRole).title + " sign-in.";

    // with a server, the password is checked there and never in this file
    if (backendOnline) {
      const response = await api("POST", "/api/login", { id: typed, password: password.value });
      if (!response.ok) {
        error.textContent = response.data.error || "Sign-in failed. Try again.";
        return;
      }
      const user = response.data;
      if (user.role !== chosenRole) {
        await fetch(API_BASE + "/api/logout", { method: "POST", headers: { Authorization: "Bearer " + user.token } }).catch(() => null);
        error.textContent = wrongPortal;
        return;
      }
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ role: user.role, name: user.name, title: user.title, token: user.token })
      );
      window.location.href = accounts.find((item) => item.role === user.role).page;
      return;
    }

    const account = accounts.find((item) => item.id === typed);

    // one message for both cases, so the page does not reveal which IDs exist
    if (!account || password.value !== DEMO_PASSWORD) {
      error.textContent = "User ID or password is not correct.";
      return;
    }

    if (account.role !== chosenRole) {
      error.textContent = wrongPortal;
      return;
    }

    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ role: account.role, name: account.name, title: account.title })
      );
    } catch (storageError) {
      error.textContent = "This browser is blocking storage, so sign-in cannot be kept.";
      return;
    }
    window.location.href = account.page;
  });
}

/* ---------- overview panel (staff, COE, admin) ---------- */

// Each list below is one tracker: one entry per item, with its state.
// "done" is finished, "todo" is still to come, "bad" needs someone to act.
const todayClasses = [
  { label: "Period 1 · II MCA · Database Systems · marked", state: "done" },
  { label: "Period 3 · I MCA · Data Structures · marked", state: "done" },
  { label: "Period 5 · II MCA · Database Systems lab · not marked", state: "bad" },
  { label: "Period 7 · I MCA · Data Structures · starts 3:10 pm", state: "todo" },
];

const campusIssues = [
  { label: "Lab 1 network port · resolved", state: "done" },
  { label: "Lab 2 projector not working · open", state: "todo" },
];

const examPipeline = {
  syllabi: [
    { label: "Database Systems · approved", state: "done" },
    { label: "Data Structures · to review", state: "todo" },
    { label: "Software Engineering · to review", state: "todo" },
  ],
  papers: [
    { label: "Operating Systems · blueprint passed", state: "done" },
    { label: "Digital Marketing · blueprint passed", state: "done" },
    { label: "Database Systems · returned to staff", state: "bad" },
  ],
  results: [
    { label: "Internal assessment 1 · published", state: "done" },
    { label: "Internal assessment 2 · starts 26 Oct", state: "todo" },
    { label: "End semester · papers being approved", state: "todo" },
  ],
  certificates: [
    { label: "Consolidated marksheet · Anitha J · verified", state: "done" },
    { label: "Transcript · Lakshmi V · to verify", state: "todo" },
    { label: "Course completion · Suresh N · to verify", state: "todo" },
  ],
};

const officeQueues = {
  certificates: [
    { label: "Bonafide · Divya S · issued", state: "done" },
    { label: "Transcript · Lakshmi V · with COE", state: "todo" },
    { label: "Course completion · Suresh N · with COE", state: "todo" },
    { label: "Consolidated marksheet · Anitha J · ready to issue", state: "todo" },
  ],
  tickets: [
    { label: "Lab 2 projector · maintenance · 1 day", state: "todo" },
    { label: "Bus pass renewal · transport · new", state: "todo" },
    { label: "Name spelling on ID card · office · 2 days", state: "todo" },
  ],
};

function countState(items, state) {
  return items.filter((item) => item.state === state).length;
}

// A title, a count, one segment per item and a line of explanation.
// The explanation always says in words what the colours show.
function tracker(title, items, hint, hintKind, value) {
  const done = countState(items, "done");
  const summary = value || done + " of " + items.length;

  const box = el("div", "tracker");
  const head = el("div", "tracker-head");
  head.append(el("span", "tracker-title", title), el("span", "tracker-value", summary));

  const bar = el("div", "segments");
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", title + ": " + summary);
  items.forEach((item) => {
    const segment = el("span", "segment " + item.state);
    segment.dataset.label = item.label; // shown on hover
    bar.append(segment);
  });

  box.append(head, bar, el("div", ("hint " + (hintKind || "")).trim(), hint));
  return box;
}

function staffOverview(state) {
  const requests = odRequests.map((request) => ({
    label: request.student + " · " + request.event,
    state: state.odApproved.includes(request.student) ? "done" : "todo",
  }));
  const waiting = countState(requests, "todo");

  const units = blueprint.units.map((unit) => ({
    label: unit.name + " · " + unit.marks + " of " + blueprint.marksPerUnit + " marks",
    state: unit.marks === blueprint.marksPerUnit ? "done" : "bad",
  }));
  const unitsOff = countState(units, "bad");

  let line = "Every OD request is approved.";
  if (waiting === 1) line = "1 OD request is waiting for your approval.";
  if (waiting > 1) line = waiting + " OD requests are waiting for your approval.";

  return {
    line,
    trackers: [
      tracker("OD requests approved", requests, waiting ? "Approve in the table below" : "Nothing waiting", waiting ? "wait" : ""),
      tracker("Classes marked today", todayClasses, "Period 5 is not marked yet", "stop"),
      tracker("Units on blueprint", units, unitsOff + " units need fixing before COE", "stop"),
      tracker("Campus issues resolved", campusIssues, "1 open with the support desk", ""),
    ],
  };
}

function coeOverview(state) {
  const record = studentRecord(state);
  const demoReady = record.attendanceOk && record.desksCleared === DESK_COUNT;

  const hallTickets = [
    { label: "Arun P · issued", state: "done" },
    { label: "Divya S · issued", state: "done" },
    { label: "Farida B · issued", state: "done" },
    { label: DEMO_STUDENT + (demoReady ? " · ready to issue" : " · on hold"), state: demoReady ? "done" : "bad" },
    { label: "Naveen M · on hold, library book due", state: "bad" },
  ];
  const held = countState(hallTickets, "bad");

  // an item is done once its approval has been given on this page
  const given = (items, keys) =>
    items.map((item, index) => {
      const key = keys[index];
      if (!key || !state.decisions.includes(key)) return item;
      return { label: item.label.split(" · ").slice(0, -1).join(" · ") + " · done", state: "done" };
    });
  const syllabi = given(examPipeline.syllabi, [null, "syllabus.ds", "syllabus.se"]);
  const certificates = given(examPipeline.certificates, [null, "cert.lakshmi", "cert.suresh"]);
  const toReview = countState(syllabi, "todo");
  const toVerify = countState(certificates, "todo");
  const syllabusLine =
    toReview === 0 ? "every syllabus is approved." : toReview + (toReview === 1 ? " syllabus is" : " syllabi are") + " waiting for approval.";

  return {
    line: held + (held === 1 ? " hall ticket is" : " hall tickets are") + " on hold, and " + syllabusLine,
    trackers: [
      tracker("Syllabi approved", syllabi, toReview ? toReview + " to review" : "Nothing waiting", toReview ? "wait" : ""),
      tracker("Papers through scrutiny", examPipeline.papers, "1 returned to staff", "stop"),
      tracker("Hall tickets ready", hallTickets, held + " on hold", "stop"),
      tracker("Results published", examPipeline.results, "Next: internal assessment 2", ""),
      tracker("Certificates verified", certificates, toVerify ? toVerify + " sent by the admin desk" : "Nothing waiting", toVerify ? "wait" : ""),
    ],
  };
}

function adminOverview(state) {
  const fees = [
    { label: DEMO_STUDENT + (state.feePaid ? " · paid" : " · exam fee due"), state: state.feePaid ? "done" : "bad" },
    { label: "Priya D · second instalment due 20 Oct", state: "todo" },
    { label: "Vignesh A · hostel fee due 31 Oct", state: "todo" },
  ];

  const mostOpen = desks.reduce((a, b) => (b.open > a.open ? b : a));
  let totalOpen = 0;
  const deskItems = desks.map((desk) => {
    const open = desk.name === "Accounts" && state.feePaid ? desk.open - 1 : desk.open;
    totalOpen += open;
    let deskState = open === 0 ? "done" : "todo";
    if (desk === mostOpen) deskState = "bad";
    return { label: desk.name + " · " + open + " open", state: deskState };
  });

  // the three sample tickets plus any raised through the query and issue forms
  const raised = state.tickets.map((ticket) => ({
    label: ticket.text + " · " + ticket.raisedBy + " · " + ticket.status,
    state: ticket.status === "closed" ? "done" : "todo",
  }));
  const allTickets = officeQueues.tickets.concat(raised);

  return {
    line: totalOpen + " no dues requests are open, most of them at the " + mostOpen.name.toLowerCase() + " desk.",
    trackers: [
      tracker("Fee balances cleared", fees, state.feePaid ? "2 students still owe" : "Exam fee closes 15 Oct", state.feePaid ? "" : "stop"),
      tracker("No dues by desk", deskItems, mostOpen.name + " desk has the longest queue", "stop", totalOpen + " open"),
      tracker("Certificates issued", officeQueues.certificates, "2 waiting for COE", "wait"),
      tracker("Support tickets closed", allTickets, countState(allTickets, "todo") + " open, each with an owner", ""),
    ],
  };
}

function renderOverview() {
  const holder = document.getElementById("trackers");
  if (!holder) return;

  const builders = { staff: staffOverview, coe: coeOverview, admin: adminOverview };
  const build = builders[document.body.dataset.role];
  if (!build) return;

  const view = build(loadState());
  setText("overview-line", view.line);
  holder.replaceChildren(...view.trackers);
}

/* ---------- queries and campus issues (support tickets) ---------- */

function currentUserName() {
  const session = currentSession();
  return session ? session.name : "";
}

// A student's query or a staff member's campus issue becomes a ticket that
// the admin's support desk sees and closes.
function addTicket(text, owner) {
  const state = loadState();
  state.tickets.push({ id: "local-" + Date.now(), text, owner, raisedBy: currentUserName(), status: "open" });
  addNote(state, "admin", "New request from " + currentUserName() + ": " + text);
  saveState(state);
  sendAction("/api/tickets", { text, owner });
}

function closeTicket(id) {
  const state = loadState();
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) return;
  ticket.status = "closed";
  addNote(state, "user:" + ticket.raisedBy, "Your request was resolved by the support desk: " + ticket.text);
  saveState(state);
  sendAction("/api/tickets/close", { id });
}

function setUpTicketForm(buttonId, inputId, chooseOwner) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  const input = document.getElementById(inputId);
  button.addEventListener("click", () => {
    const text = input.value.trim();
    if (text.length < 3) {
      input.focus();
      return;
    }
    addTicket(text, chooseOwner());
    input.value = "";
    renderTickets();
  });
}

function renderTickets() {
  const tickets = loadState().tickets;

  // the person who raised them sees their own, with the current status
  const mine = document.getElementById("my-tickets");
  if (mine) {
    const own = tickets.filter((ticket) => ticket.raisedBy === currentUserName());
    mine.replaceChildren();
    own.forEach((ticket) => {
      const row = el("div", "row wrap");
      const label = el("span", "", ticket.text);
      label.append(el("span", "detail", "Sent to " + ticket.owner));
      const open = ticket.status !== "closed";
      row.append(label, el("span", "pill " + (open ? "wait" : "ok"), open ? "Open" : "Closed"));
      mine.append(row);
    });
  }

  // the support desk sees every ticket and can close it
  const desk = document.getElementById("ticket-rows");
  if (desk) {
    desk.replaceChildren();
    tickets.forEach((ticket) => {
      const row = el("div", "row wrap");
      const label = el("span", "", ticket.text + " · raised by " + ticket.raisedBy);
      label.append(el("span", "detail", "Owner: " + ticket.owner));
      row.append(label);
      if (ticket.status === "closed") {
        row.append(el("span", "pill ok", "Closed"));
      } else {
        const button = el("button", "btn outline", "Close ticket");
        button.type = "button";
        button.addEventListener("click", () => {
          closeTicket(ticket.id);
          renderTickets();
          renderOverview();
        });
        row.append(button);
      }
      desk.append(row);
    });
  }
}

/* ---------- notifications ---------- */

// Without a server the page writes the messages itself; with one, the
// server writes them and these local copies are replaced by its reply.
function addNote(state, toRole, text) {
  state.notifications.unshift({ id: "local-" + Date.now() + "-" + state.notifications.length, to: toRole, text, read: false });
}

function noteIfReady(state) {
  if (!state.feePaid || !state.odApproved.includes(DEMO_STUDENT)) return;
  addNote(state, "student", "Your hall ticket is ready to issue: attendance and dues are both clear.");
  addNote(state, "coe", DEMO_STUDENT + " is now eligible. The hall ticket is ready to issue.");
}

// A message is for a whole role ("staff") or for one person ("user:Raja").
function isForMe(item) {
  return item.to === document.body.dataset.role || item.to === "user:" + currentUserName();
}

function myNotifications() {
  return loadState().notifications.filter(isForMe);
}

async function markNotificationsRead() {
  if (backendOnline) {
    const response = await api("POST", "/api/notifications/read").catch(() => null);
    if (response && response.ok) recordStore().setItem(STORE_KEY, JSON.stringify(response.data));
    return;
  }
  const state = loadState();
  state.notifications.forEach((item) => {
    if (isForMe(item)) item.read = true;
  });
  saveState(state);
}

// A bell in the top bar with the unread count, a list that opens under it,
// and a pop-up for anything that arrived since this tab last looked.
function renderNotifications() {
  const slot = document.getElementById("session");
  if (!slot || !document.body.dataset.role) return;

  const notes = myNotifications();
  const unread = notes.filter((item) => !item.read);

  let bell = document.getElementById("bell");
  if (!bell) {
    bell = el("button", "bell");
    bell.id = "bell";
    bell.type = "button";
    bell.setAttribute("aria-expanded", "false");
    const panel = el("div", "bell-panel");
    panel.id = "bell-panel";
    panel.hidden = true;
    bell.addEventListener("click", async () => {
      panel.hidden = !panel.hidden;
      bell.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) {
        await markNotificationsRead();
        bell.textContent = "Notifications";
        bell.classList.remove("has-unread");
      }
    });
    slot.prepend(bell, panel);
  }
  bell.textContent = unread.length > 0 ? "Notifications (" + unread.length + ")" : "Notifications";
  bell.classList.toggle("has-unread", unread.length > 0);

  const panel = document.getElementById("bell-panel");
  panel.replaceChildren();
  if (notes.length === 0) panel.append(el("p", "muted", "Nothing yet. You are told here as soon as someone acts on your request."));
  notes.forEach((item) => {
    const row = el("p", item.read ? "" : "unread", item.text);
    if (item.at) row.append(el("span", "detail", new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
    panel.append(row);
  });

  // pop up each unread message once per tab
  let shown = [];
  try {
    shown = JSON.parse(sessionStorage.getItem("cms-toasted")) || [];
  } catch (error) {
    shown = [];
  }
  const fresh = unread.filter((item) => !shown.includes(String(item.id)));
  if (fresh.length === 0) return;
  let stack = document.getElementById("toasts");
  if (!stack) {
    stack = el("div", "toasts");
    stack.id = "toasts";
    stack.setAttribute("role", "status");
    document.body.append(stack);
  }
  fresh.forEach((item) => {
    const toast = el("div", "toast", item.text);
    stack.append(toast);
    setTimeout(() => toast.remove(), 8000);
  });
  try {
    sessionStorage.setItem("cms-toasted", JSON.stringify(shown.concat(fresh.map((item) => String(item.id))).slice(-60)));
  } catch (error) {
    // the message may pop up again after a reload; harmless
  }
}

/* ---------- single-step approvals ---------- */

// Who is told when each approval is given. The server holds the same list
// and is the one that counts; this copy is used when there is no server.
const approvals = {
  "syllabus.ds": [["staff", "The COE approved the Data Structures syllabus."]],
  "syllabus.se": [["staff", "The COE approved the Software Engineering syllabus."]],
  "cert.lakshmi": [
    ["admin", "Marks verified for the transcript of Lakshmi V. It is ready to issue."],
    ["alumni", "The COE has verified your marks. Your transcript is now with the admin desk."],
  ],
  "cert.suresh": [["admin", "Marks verified for the course completion certificate of Suresh N. It is ready to issue."]],
  "cert.lakshmi.issue": [["alumni", "Your transcript has been issued. You can download it with its QR code."]],
  "cert.anitha.issue": [],
  "hallticket.devi": [["student", "Your hall ticket has been issued by the COE."]],
  "project.devi": [["student", "Your guide accepted your proposal. You can continue the 2024 face recognition attendance project."]],
  "attendance.p5": [],
  "fees.remind": [["student", "Reminder from the accounts desk: your exam fee is due and is holding your hall ticket."]],
};

// A reason the approval cannot be given yet, or "" if it can.
function approvalBlocked(key) {
  if (key !== "hallticket.devi") return "";
  const record = studentRecord(loadState());
  const ready = record.attendanceOk && record.desksCleared === DESK_COUNT;
  return ready ? "" : "Nobody new is eligible yet. " + DEMO_STUDENT + " is still on hold.";
}

// <button data-action="key" data-done="text"> gives an approval.
// data-needs="other key" keeps it back until an earlier step is done.
// <span data-shows="key" data-done="text"> reflects one given by someone else.
function renderApprovals() {
  const done = loadState().decisions;

  document.querySelectorAll("[data-shows]").forEach((node) => {
    if (!done.includes(node.dataset.shows)) return;
    node.className = "pill ok";
    node.textContent = node.dataset.done;
    node.removeAttribute("data-followup");
    node.removeAttribute("title");
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    const key = button.dataset.action;
    if (done.includes(key)) {
      button.replaceWith(el("span", "pill ok", button.dataset.done));
      return;
    }
    if (button.dataset.needs && !done.includes(button.dataset.needs)) {
      button.hidden = true;
      if (!button.nextElementSibling) button.after(el("span", "pill wait", button.dataset.waiting));
      return;
    }
    button.hidden = false;
    if (button.nextElementSibling) button.nextElementSibling.remove();
    if (button.dataset.ready) return;
    button.dataset.ready = "yes";
    button.addEventListener("click", () => {
      const blocked = approvalBlocked(key);
      if (blocked) {
        window.alert(blocked);
        return;
      }
      const state = loadState();
      state.decisions.push(key);
      approvals[key].forEach(([role, text]) => addNote(state, role, text));
      saveState(state);
      renderApprovals();
      renderHallTickets();
      renderOverview();
      sendAction("/api/decisions", { key });
    });
  });

  // alumni: the certificate tracker moves on as each office acts
  const steps = document.querySelectorAll("#certificate .steps li");
  if (steps.length === 5) {
    const verified = done.includes("cert.lakshmi");
    const issued = done.includes("cert.lakshmi.issue");
    if (verified) {
      steps[2].className = "done";
      steps[2].querySelector("small").textContent = "Step 3 · Done";
      steps[2].removeAttribute("data-followup");
      steps[2].removeAttribute("title");
      steps[3].className = issued ? "done" : "current";
      steps[3].querySelector("small").textContent = issued ? "Step 4 · Done" : "Step 4 · With the admin desk";
    }
    if (issued) {
      steps[4].className = "current";
      steps[4].querySelector("small").textContent = "Step 5 · Ready";
    }
  }
}

/* ---------- requests from one role to another ---------- */

// The server holds the same list and is the one that counts.
const requestKinds = {
  od: { to: "staff", label: "OD request", accepted: "approved", accept: "Approve" },
  hallticket: { to: "coe", label: "Hall ticket request", accepted: "issued", accept: "Issue hall ticket", decision: "hallticket.devi" },
  submission: { to: "staff", label: "Assignment submission", accepted: "accepted", accept: "Accept submission" },
  general: { label: "Request", accepted: "accepted", accept: "Accept" },
  // goes to the one colleague asked to take the class; the office is told once it is agreed
  duty: { to: "staff", label: "Class alteration", accepted: "accepted", accept: "Accept the class", inform: "admin", declinable: true },
  // given by the examinations office to one staff member, who accepts or declines it
  invigilation: { to: "staff", label: "Invigilation duty", accepted: "accepted", accept: "Accept duty", declinable: true },
  certificate: { to: "admin", label: "Certificate request", accepted: "issued", accept: "Issue" },
  referral: { to: "admin", label: "Job referral", accepted: "published", accept: "Publish", announce: "student" },
  mentoring: { to: "admin", label: "Mentoring offer", accepted: "published", accept: "Publish", announce: "student" },
  business: { to: "admin", label: "Business listing", accepted: "listed", accept: "List" },
  profile: { to: "admin", label: "Record update", accepted: "updated", accept: "Update record" },
};

// A general request goes one step up, to the sender's own superior.
const superiorOf = { student: "staff", staff: "coe", coe: "admin", alumni: "admin" };

// "2026-10-12T09:00" -> "12 Oct 2026, 09:00"
function readableDateTime(value) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return "";
  return Number(match[3]) + " " + months[Number(match[2]) - 1] + " " + match[1] + ", " + match[4] + ":" + match[5];
}

// "dates" is { from, to } for the kinds that need a start and an end.
// "extra" is anything more the server needs to check the request itself;
// extra.colleague sends the request to that one person instead of a role.
function addRequest(kind, text, dates, extra) {
  const rule = requestKinds[kind];
  const toRole = rule.to || superiorOf[document.body.dataset.role];
  const toName = (extra && (extra.colleague || extra.staff)) || "";
  const shown = dates ? text + " · from " + readableDateTime(dates.from) + " to " + readableDateTime(dates.to) : text;
  const state = loadState();
  const request = { id: "local-" + Date.now(), kind, text: shown, fromName: currentUserName(), toRole, status: "open" };
  if (toName) {
    request.toName = toName;
    request.slot = extra.session ? "inv:" + extra.date + "#" + extra.session : extra.date + "#" + extra.period;
    if (kind === "duty") state.covering.push({ slot: request.slot, name: toName, by: currentUserName() });
  }
  state.requests.push(request);
  addNote(state, toName ? "user:" + toName : toRole, "New " + rule.label.toLowerCase() + " from " + currentUserName() + ": " + shown);
  saveState(state);
  sendAction("/api/requests", Object.assign({ kind, text }, dates || {}, extra || {}));
}

function acceptRequest(id) {
  const state = loadState();
  const request = state.requests.find((item) => item.id === id);
  if (!request || request.status !== "open") return;
  const rule = requestKinds[request.kind];
  if (rule.decision) {
    const blocked = approvalBlocked(rule.decision);
    if (blocked) {
      window.alert(blocked);
      return;
    }
    if (!state.decisions.includes(rule.decision)) state.decisions.push(rule.decision);
  }
  request.status = "accepted";
  const done = rule.label.toLowerCase() + " was " + rule.accepted + " by " + currentUserName() + ": " + request.text;
  addNote(state, "user:" + request.fromName, "Your " + done);
  if (rule.inform) {
    addNote(state, rule.inform, rule.label + " agreed between " + request.fromName + " and " + currentUserName() + ": " + request.text);
  }
  if (rule.announce) {
    addNote(state, rule.announce, "New from the alumni network (" + rule.label.toLowerCase() + "): " + request.text);
  }
  saveState(state);
  sendAction("/api/requests/accept", { id });
}

// The person asked says no; the sender is told so they can ask someone else.
function declineRequest(id) {
  const state = loadState();
  const request = state.requests.find((item) => item.id === id);
  if (!request || request.status !== "open") return;
  const rule = requestKinds[request.kind];
  request.status = "declined";
  state.covering = state.covering.filter((item) => !(item.slot === request.slot && item.name === request.toName));
  addNote(state, "user:" + request.fromName, currentUserName() + " declined your " + rule.label.toLowerCase() + ": " + request.text + ". Please choose someone else.");
  saveState(state);
  sendAction("/api/requests/decline", { id });
}

function labelled(form, id, text, field) {
  const label = el("label", "", text);
  label.htmlFor = id;
  field.id = id;
  form.append(label, field);
  return field;
}

// <button data-request="kind"> opens a short form under its card heading.
// data-options="A|B" asks with a list instead of a text box.
// data-fixed="text" needs no form: one press sends that text.
// An OD request also asks for the start and end, as date and time.
function setUpRequestForms() {
  document.querySelectorAll("[data-request]").forEach((button) => {
    if (button.dataset.ready) return;
    button.dataset.ready = "yes";
    const kind = button.dataset.request;

    if (button.dataset.fixed) {
      button.addEventListener("click", () => {
        addRequest(kind, button.dataset.fixed);
        renderRequests();
      });
      return;
    }

    const form = el("form", "form request-form");
    form.hidden = true;
    form.noValidate = true; // the messages below are clearer than the browser's own
    let field;
    if (button.dataset.options) {
      field = el("select");
      button.dataset.options.split("|").forEach((option) => field.append(el("option", "", option)));
    } else {
      field = el("input");
      field.type = "text";
      field.maxLength = 200;
    }
    labelled(form, "request-" + kind, button.dataset.ask, field);

    let from = null;
    let to = null;
    if (kind === "od") {
      const times = el("div", "request-times");
      const start = el("div", "field");
      const end = el("div", "field");
      from = el("input");
      from.type = "datetime-local";
      to = el("input");
      to.type = "datetime-local";
      labelled(start, "request-od-from", "From (date and time)", from);
      labelled(end, "request-od-to", "To (date and time)", to);
      times.append(start, end);
      form.append(times);
    }

    const send = el("button", "btn", button.dataset.send || "Send");
    send.type = "submit";
    const problem = el("p", "text-stop");
    problem.setAttribute("role", "alert");
    form.append(send, problem);

    // the form sits under the heading row or button row the button is in
    const holder = button.closest(".card-head, .actions, .row") || button;
    holder.after(form);

    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      form.hidden = !form.hidden;
      button.setAttribute("aria-expanded", String(!form.hidden));
      if (!form.hidden) field.focus();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const typed = field.value.trim();
      if (typed.length < 3) {
        problem.textContent = "Write a few words so the other person knows what you are asking for.";
        field.focus();
        return;
      }
      let dates = null;
      if (from) {
        if (!from.value || !to.value) {
          problem.textContent = "Choose the date and time for both From and To.";
          (from.value ? to : from).focus();
          return;
        }
        if (to.value <= from.value) {
          problem.textContent = "To must be later than From.";
          to.focus();
          return;
        }
        dates = { from: from.value, to: to.value };
      }
      problem.textContent = "";
      addRequest(kind, (button.dataset.prefix || "") + typed, dates);
      if (field.tagName === "INPUT") field.value = "";
      if (from) {
        from.value = "";
        to.value = "";
      }
      form.hidden = true;
      button.setAttribute("aria-expanded", "false");
      renderRequests();
    });
  });
}

function titleOf(role) {
  return accounts.find((account) => account.role === role).title;
}

// data-my-requests="kinds" lists what this person has asked for;
// data-inbox="kinds" lists what is waiting for this role to accept.
function renderRequests() {
  const role = document.body.dataset.role;
  const requests = loadState().requests;
  const me = currentUserName();
  const capital = (word) => word.charAt(0).toUpperCase() + word.slice(1);

  document.querySelectorAll("[data-my-requests]").forEach((box) => {
    const kinds = box.dataset.myRequests.split(" ");
    const mine = requests.filter((item) => kinds.includes(item.kind) && item.fromName === me);
    box.replaceChildren();
    mine.forEach((item) => {
      const rule = requestKinds[item.kind];
      const target = item.toName || titleOf(item.toRole);
      const row = el("div", "row wrap");
      const label = el("span", "", item.text);
      label.append(el("span", "detail", rule.label + " · sent to " + target));
      let pill = el("span", "pill ok", capital(rule.accepted));
      if (item.status === "open") pill = el("span", "pill wait", "Waiting for " + target);
      if (item.status === "declined") pill = el("span", "pill stop", "Declined by " + target);
      row.append(label, pill);
      box.append(row);
    });
  });

  // a one-press request can be sent once; after that its status is in the list
  document.querySelectorAll("[data-request][data-fixed]").forEach((button) => {
    button.hidden = requests.some(
      (item) => item.kind === button.dataset.request && item.text === button.dataset.fixed && item.fromName === me
    );
  });

  document.querySelectorAll("[data-inbox]").forEach((box) => {
    const kinds = box.dataset.inbox.split(" ");
    const waiting = requests.filter(
      (item) => kinds.includes(item.kind) && item.toRole === role && item.fromName !== me && (!item.toName || item.toName === me)
    );
    box.replaceChildren();
    if (waiting.length === 0 && box.dataset.empty) box.append(el("p", "note muted", box.dataset.empty));
    waiting.forEach((item) => {
      const rule = requestKinds[item.kind];
      const row = el("div", "row wrap");
      const label = el("span", "", item.text);
      label.append(el("span", "detail", rule.label + " · from " + item.fromName));
      row.append(label);
      if (item.status === "open") {
        const button = el("button", "btn", rule.accept);
        button.type = "button";
        button.addEventListener("click", () => {
          acceptRequest(item.id);
          renderRequests();
          renderApprovals();
          renderHallTickets();
        });
        row.append(button);
        if (rule.declinable) {
          const no = el("button", "btn outline", "Decline");
          no.type = "button";
          no.addEventListener("click", () => {
            declineRequest(item.id);
            renderRequests();
          });
          row.append(no);
        }
      } else if (item.status === "declined") {
        row.append(el("span", "pill stop", "Declined · " + item.fromName + " notified"));
      } else {
        row.append(el("span", "pill ok", capital(rule.accepted) + " · " + item.fromName + " notified"));
      }
      box.append(row);
    });
  });
}

/* ---------- staff: in and out times ---------- */

// Each staff member's own times. Sample values, replaced by the server's
// when it is running.
const inOutSamples = {
  Saran: [
    { date: "2026-10-01", in: "08:48", out: "16:35" },
    { date: "2026-10-03", in: "08:55", out: "13:10" },
    { date: "2026-10-05", in: "08:41", out: "16:42" },
    { date: "2026-10-06", in: "08:50", out: "17:05" },
    { date: "2026-10-07", in: "09:02", out: "16:30" },
    { date: "2026-10-08", in: "08:52", out: null },
  ],
  Raja: [
    { date: "2026-10-01", in: "08:35", out: "16:20" },
    { date: "2026-10-03", in: "08:40", out: "13:00" },
    { date: "2026-10-05", in: "08:38", out: "16:30" },
    { date: "2026-10-06", in: "08:44", out: "16:15" },
    { date: "2026-10-07", in: "08:31", out: "16:50" },
    { date: "2026-10-08", in: "08:36", out: null },
  ],
  Gopika: [
    { date: "2026-10-01", in: "08:58", out: "16:45" },
    { date: "2026-10-05", in: "08:49", out: "16:40" },
    { date: "2026-10-06", in: "08:53", out: "16:35" },
    { date: "2026-10-07", in: "08:47", out: "17:10" },
    { date: "2026-10-08", in: "08:55", out: null },
  ],
};
const staffInOut = [];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-12" -> { day: "Mon", label: "Mon 12 Oct 2026" }, or null.
function readDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const date = new Date(match[0] + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return null;
  const day = DAY_NAMES[date.getUTCDay()];
  return { day, label: day + " " + Number(match[3]) + " " + MONTH_NAMES[Number(match[2]) - 1] + " " + match[1] };
}

const minutesOf = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

// "16:35" -> "4:35 pm"
function clockLabel(clock) {
  const hours = Number(clock.slice(0, 2));
  return ((hours + 11) % 12) + 1 + ":" + clock.slice(3, 5) + (hours < 12 ? " am" : " pm");
}

function renderInOut() {
  const body = document.getElementById("inout-rows");
  if (!body) return;
  body.replaceChildren();
  staffInOut.forEach((entry) => {
    const row = el("tr");
    const date = readDate(entry.date);
    row.append(el("td", "", date ? date.label.replace(/ \d{4}$/, "") : entry.date));
    row.append(el("td", "mono", clockLabel(entry.in)));
    if (entry.out) {
      const worked = minutesOf(entry.out) - minutesOf(entry.in);
      row.append(el("td", "mono", clockLabel(entry.out)));
      row.append(el("td", "mono", Math.floor(worked / 60) + " h " + String(worked % 60).padStart(2, "0") + " min"));
    } else {
      const here = el("td");
      here.append(el("span", "pill ok", "On campus"));
      row.append(here, el("td", "muted", "Today"));
    }
    body.append(row);
  });
  setText("inout-days", staffInOut.length + " / " + staffInOut.length);
  if (staffInOut.length > 0) {
    const average = Math.round(staffInOut.reduce((sum, entry) => sum + minutesOf(entry.in), 0) / staffInOut.length);
    setText("inout-average", clockLabel(String(Math.floor(average / 60)).padStart(2, "0") + ":" + String(average % 60).padStart(2, "0")));
  }
}

/* ---------- staff: class alteration ---------- */

// The weekly timetable by staff member. The server holds the same one and
// checks every alteration against it; these values are used when there is
// no server.
const timetableSamples = {
  Saran: {
    Mon: { 1: "Database Systems · II MCA", 3: "Data Structures · I MCA", 5: "Database Systems lab · II MCA", 7: "Data Structures · I MCA" },
    Tue: { 2: "Database Systems · II MCA", 4: "Data Structures · I MCA", 6: "Database Systems lab · II MCA" },
    Wed: { 1: "Data Structures · I MCA", 3: "Database Systems · II MCA", 5: "Data Structures lab · I MCA" },
    Thu: { 2: "Database Systems · II MCA", 5: "Data Structures · I MCA", 7: "Database Systems · II MCA" },
    Fri: { 1: "Data Structures · I MCA", 4: "Database Systems · II MCA", 6: "Data Structures · I MCA" },
    Sat: { 2: "Database Systems · II MCA", 3: "Data Structures · I MCA" },
  },
  Raja: {
    Mon: { 1: "Operating Systems · II MCA", 2: "Software Engineering · I MCA", 6: "Operating Systems lab · II MCA", 8: "Software Engineering · I MCA" },
    Tue: { 1: "Software Engineering · I MCA", 2: "Operating Systems · II MCA", 3: "Operating Systems lab · II MCA", 7: "Software Engineering · I MCA" },
    Wed: { 2: "Operating Systems · II MCA", 4: "Software Engineering · I MCA", 6: "Operating Systems · II MCA" },
    Thu: { 1: "Software Engineering · I MCA", 4: "Operating Systems · II MCA", 6: "Software Engineering lab · I MCA" },
    Fri: { 2: "Operating Systems · II MCA", 3: "Software Engineering · I MCA", 5: "Operating Systems · II MCA" },
    Sat: { 1: "Software Engineering · I MCA", 4: "Operating Systems · II MCA" },
  },
  Gopika: {
    Mon: { 2: "Digital Marketing · II MCA", 4: "Web Technology · I MCA", 7: "Digital Marketing · II MCA" },
    Tue: { 2: "Web Technology · I MCA", 5: "Digital Marketing · II MCA", 7: "Web Technology lab · I MCA", 8: "Digital Marketing · II MCA" },
    Wed: { 1: "Web Technology · I MCA", 2: "Digital Marketing · II MCA", 7: "Web Technology · I MCA" },
    Thu: { 3: "Digital Marketing · II MCA", 5: "Web Technology · I MCA", 8: "Digital Marketing · II MCA" },
    Fri: { 1: "Digital Marketing · II MCA", 2: "Web Technology · I MCA", 7: "Web Technology lab · I MCA" },
    Sat: { 2: "Digital Marketing · II MCA", 3: "Web Technology · I MCA" },
  },
};

// Filled for the signed-in staff member: their own classes, and the
// periods in which each colleague is teaching.
const ownClasses = {};
const colleagueBusy = {};

function loadStaffSamples() {
  const me = currentUserName();
  if (!timetableSamples[me]) return;
  staffInOut.splice(0, staffInOut.length, ...inOutSamples[me]);
  Object.assign(ownClasses, timetableSamples[me]);
  Object.keys(timetableSamples).forEach((name) => {
    if (name === me) return;
    colleagueBusy[name] = {};
    Object.keys(timetableSamples[name]).forEach((day) => {
      colleagueBusy[name][day] = Object.keys(timetableSamples[name][day]).map(Number);
    });
  });
}

// Pick the date, then one of your own periods that day, then a colleague.
// The colleague list holds only people with no class in that period.
function setUpAlteration() {
  const form = document.getElementById("alter-form");
  if (!form) return;
  const dateField = document.getElementById("alter-date");
  const periodField = document.getElementById("alter-period");
  const colleagueField = document.getElementById("alter-colleague");
  const hint = document.getElementById("alter-hint");
  const problem = document.getElementById("alter-error");

  const fill = (select, options, placeholder) => {
    select.replaceChildren();
    const first = el("option", "", placeholder);
    first.value = "";
    select.append(first);
    options.forEach(([value, label]) => {
      const option = el("option", "", label);
      option.value = value;
      select.append(option);
    });
    select.disabled = options.length === 0;
  };

  const showColleagues = () => {
    const date = readDate(dateField.value);
    const period = Number(periodField.value);
    problem.textContent = "";
    if (!date || !period) {
      fill(colleagueField, [], "Choose a period first");
      hint.textContent = "";
      return;
    }
    const names = Object.keys(colleagueBusy);
    const slot = dateField.value + "#" + period;
    const covering = loadState().covering.filter((item) => item.slot === slot).map((item) => item.name);
    const free = names.filter((name) => !(colleagueBusy[name][date.day] || []).includes(period) && !covering.includes(name));
    const busy = names.filter((name) => !free.includes(name));
    fill(colleagueField, free.map((name) => [name, name]), free.length ? "Choose a colleague" : "Nobody is free");
    const busyText = busy.length ? " Teaching or already covering then, so not offered: " + busy.join(", ") + "." : "";
    hint.textContent = free.length
      ? free.length + " of " + names.length + " colleagues are free in period " + period + "." + busyText
      : "Nobody is free in period " + period + " on " + date.label + ". Choose another period, or ask the office." + busyText;
  };

  const showPeriods = () => {
    const date = readDate(dateField.value);
    const classes = date ? ownClasses[date.day] || {} : {};
    const options = Object.keys(classes).map((period) => [period, "Period " + period + " · " + classes[period]]);
    let placeholder = "Choose a date first";
    if (date) placeholder = options.length ? "Choose your period" : "You have no classes on " + date.label;
    fill(periodField, options, placeholder);
    showColleagues();
  };

  dateField.addEventListener("change", showPeriods);
  periodField.addEventListener("change", showColleagues);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const date = readDate(dateField.value);
    const period = Number(periodField.value);
    const colleague = colleagueField.value;
    if (!date) {
      problem.textContent = "Choose the date of the class.";
      dateField.focus();
      return;
    }
    if (!period) {
      problem.textContent = "Choose which of your periods needs covering.";
      periodField.focus();
      return;
    }
    if (!colleague) {
      problem.textContent = colleagueField.disabled
        ? "Nobody is free in that period, so this class cannot be altered."
        : "Choose the colleague who will take the class.";
      colleagueField.focus();
      return;
    }
    const slot = dateField.value + "#" + period;
    if (loadState().covering.some((item) => item.slot === slot && item.by === currentUserName())) {
      problem.textContent = "That class already has an alteration.";
      return;
    }
    const where = "Period " + period + " on " + date.label;
    const text = where + " (" + ownClasses[date.day][period] + ") goes to " + colleague + ", who is free in that period";
    addRequest("duty", text, null, { date: dateField.value, period, colleague });
    dateField.value = "";
    showPeriods();
    renderRequests();
  });
}

/* ---------- COE: invigilation duty ---------- */

const examHalls = ["A101", "A102", "A201", "B105"];
const examSessions = { FN: "forenoon", AN: "afternoon" };

// The COE picks the date, session, hall and staff member. The duty goes to
// that one person for acceptance. The server repeats these checks.
function setUpInvigilation() {
  const form = document.getElementById("invigilation-form");
  if (!form) return;
  const dateField = document.getElementById("inv-date");
  const sessionField = document.getElementById("inv-session");
  const hallField = document.getElementById("inv-hall");
  const staffField = document.getElementById("inv-staff");
  const problem = document.getElementById("inv-error");

  examHalls.forEach((hall) => hallField.append(el("option", "", hall)));
  accounts.filter((account) => account.role === "staff").forEach((account) => staffField.append(el("option", "", account.name)));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const date = readDate(dateField.value);
    if (!date) {
      problem.textContent = "Choose the date of the examination.";
      dateField.focus();
      return;
    }
    if (date.day === "Sun") {
      problem.textContent = "There are no examinations on a Sunday.";
      dateField.focus();
      return;
    }
    const session = sessionField.value;
    const hall = hallField.value;
    const staff = staffField.value;
    const slot = "inv:" + dateField.value + "#" + session;
    const when = date.label + ", " + examSessions[session];
    const given = loadState().requests.filter((item) => item.kind === "invigilation" && item.status !== "declined" && item.slot === slot);
    if (given.some((item) => item.toName === staff)) {
      problem.textContent = staff + " already has an invigilation duty on " + when + ".";
      return;
    }
    if (given.some((item) => item.text.endsWith("Hall " + hall))) {
      problem.textContent = "Hall " + hall + " already has an invigilator on " + when + ".";
      return;
    }
    problem.textContent = "";
    addRequest("invigilation", "Invigilation · " + when + " · Hall " + hall, null, { date: dateField.value, session, hall, staff });
    dateField.value = "";
    renderRequests();
  });
}

/* ---------- alumni: directory search ---------- */

const alumniDirectory = [
  { name: "Lakshmi V", batch: "MCA 2022", city: "Chennai", field: "Software testing" },
  { name: "Karthik R", batch: "MCA 2022", city: "Bengaluru", field: "Data engineering" },
  { name: "Meena S", batch: "MCA 2021", city: "Coimbatore", field: "Web development" },
  { name: "Suresh N", batch: "MCA 2025", city: "Madurai", field: "Higher studies" },
  { name: "Anitha J", batch: "MCA 2020", city: "Chennai", field: "Training and coaching" },
  { name: "Imran K", batch: "MCA 2021", city: "Dindigul", field: "Software services" },
];

function setUpAlumniSearch() {
  const button = document.getElementById("alumni-search-go");
  if (!button) return;
  const input = document.getElementById("alumni-search");
  const results = document.getElementById("alumni-results");

  const search = () => {
    const wanted = input.value.trim().toLowerCase();
    results.replaceChildren();
    if (!wanted) {
      results.append(el("p", "note muted", "Type a name, batch year, city or field of work."));
      return;
    }
    const found = alumniDirectory.filter((person) =>
      (person.name + " " + person.batch + " " + person.city + " " + person.field).toLowerCase().includes(wanted)
    );
    if (found.length === 0) {
      results.append(el("p", "note muted", "Nobody matches \u201C" + input.value.trim() + "\u201D. Try a city or a batch year."));
      return;
    }
    found.forEach((person) => {
      const row = el("div", "row");
      const label = el("span", "", person.name);
      label.append(el("span", "detail", person.batch + " · " + person.city));
      row.append(label, el("span", "muted", person.field));
      results.append(row);
    });
  };

  button.addEventListener("click", search);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      search();
    }
  });
}

/* ---------- who handles the next step ---------- */

// An element marked data-followup="role#section" is waiting on another
// role. Nobody can open another role's page, so the element only says who
// has the next step.
function setUpFollowUps(root) {
  (root || document).querySelectorAll("[data-followup]").forEach((node) => {
    const role = node.dataset.followup.split("#")[0];
    const account = accounts.find((item) => item.role === role);
    node.title = "Next step is with " + account.title;
  });
}

function setUpReset() {
  const button = document.getElementById("reset-demo");
  if (!button) return;
  button.addEventListener("click", async () => {
    if (backendOnline) await api("POST", "/api/reset").catch(() => null);
    try {
      recordStore().removeItem(STORE_KEY);
    } catch (error) {
      // nothing stored, nothing to clear
    }
    window.location.reload();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!guardPage()) return;

  loadStaffSamples();
  if (document.body.dataset.role === "staff") {
    setText("staff-who", currentUserName() + " · Assistant Professor, Computer Applications · Sample data");
  }

  // dashboards load the shared records before drawing anything
  const online = await connectBackend();
  if (online && document.body.dataset.role) {
    if (!ensureServerSession()) return;
    await pullState();
    await pullRecords();
    startPolling();
  }
  showBackendStatus();

  setUpLogin();
  setUpReset();
  renderOverview();
  setUpFollowUps();
  renderApprovals();
  setUpRequestForms();
  renderRequests();
  setUpAlumniSearch();
  renderInOut();
  setUpAlteration();
  setUpInvigilation();
  renderNotifications();

  // without a server, another tab of this browser may act: pick that up at once
  window.addEventListener("storage", (event) => {
    if (!backendOnline && event.key === STORE_KEY) showChange();
  });
  setUpTicketForm("query-send", "query-text", () => document.getElementById("query-desk").value);
  setUpTicketForm("issue-send", "issue-text", () => "Support desk");
  renderTickets();
  renderFees();
  renderHallTickets();
  renderAttendance();
  setUpProjectCheck();
  renderOdApprovals();
  renderBlueprint();
  renderDesks();
});
