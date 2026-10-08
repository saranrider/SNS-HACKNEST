// College Management System - page behaviour.
// Every page loads this file; each section only runs if its container exists.

const MIN_ATTENDANCE = 0.75;
const DESK_COUNT = 4;
const HALL_TICKET_CLASS_SIZE = 5;

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
  { id: "devi", role: "student", name: "Devi", title: "Student", page: "student.html" },
  { id: "saran", role: "staff", name: "Saran", title: "Staff", page: "staff.html" },
  { id: "brundha", role: "coe", name: "Brundha", title: "COE", page: "coe.html" },
  { id: "admin", role: "admin", name: "Admin", title: "Admin", page: "admin.html" },
  { id: "alumni", role: "alumni", name: "Alumni", title: "Alumni", page: "alumni.html" },
];

function currentSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch (error) {
    return null;
  }
}

function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    // nothing stored
  }
  window.location.href = "index.html";
}

function loadState() {
  const state = { odApproved: [], feePaid: false };
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(STORE_KEY)) || {});
  } catch (error) {
    // storage blocked or corrupted: carry on with the defaults
  }
  return state;
}

function saveState(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (error) {
    // the page still works for this visit, it just will not carry over
  }
  notifySplitView();
}

// A dashboard shown inside the side-by-side view is loaded with ?embed=split.
function isEmbedded() {
  return new URLSearchParams(window.location.search).get("embed") === "split";
}

// Tells the side-by-side view that something changed, so it can refresh
// the dashboard in the other pane.
function notifySplitView() {
  if (window.parent !== window) {
    window.parent.postMessage("cms-state-changed", "*");
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
    setText("ht-status", "Ready to issue");
    setStatus("ht-hint", "hint", "", "Both conditions met");
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
  let pending = odRequests.filter((request) => !state.odApproved.includes(request.student)).length;
  setText("od-pending", pending);

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
        state.odApproved.push(request.student);
        saveState(state);
        showApproved();
        pending -= 1;
        setText("od-pending", pending);
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
  const totalOpen = list.reduce((sum, desk) => sum + desk.open, 0);

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

  setText("nodues-open", totalOpen);
  setText("slowest-desk", "Slowest desk: " + slowest.name);
}

/* ---------- admin: fee follow-up ---------- */

const STUDENTS_WITH_BALANCE = 3;

function renderFees() {
  const slot = document.getElementById("fee-devi");
  if (!slot) return;

  const state = loadState();
  const showPaid = () => {
    slot.replaceChildren(el("span", "pill ok", "Paid · accounts desk cleared"));
    setText("fee-balance-count", STUDENTS_WITH_BALANCE - 1);
  };

  if (state.feePaid) {
    showPaid();
    return;
  }

  setText("fee-balance-count", STUDENTS_WITH_BALANCE);
  const button = el("button", "btn outline", "Record payment");
  button.type = "button";
  button.addEventListener("click", () => {
    state.feePaid = true;
    saveState(state);
    showPaid();
    renderDesks();
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
  setStatus("coe-status", "pill", onHold ? "stop" : "ok", onHold ? "On hold · " + reasons.join(", ") : "Ready to issue");

  // three classmates already hold tickets, one is held for a library book
  const ready = 3 + (onHold ? 0 : 1);
  setText("ht-issued", ready + " / " + HALL_TICKET_CLASS_SIZE);
  setText("ht-issued-hint", HALL_TICKET_CLASS_SIZE - ready + " on hold");
}

/* ---------- sign in and page access ---------- */

// Each dashboard declares its role on <body data-role>. Visitors who are
// not signed in with that role are sent back to the sign-in page.
function guardPage() {
  const role = document.body.dataset.role;
  if (!role) return true;

  const slot = document.getElementById("session");

  // The side-by-side presenter view shows a dashboard without signing in,
  // as the demo account for that role. It has no Sign out button.
  if (isEmbedded()) {
    const account = accounts.find((item) => item.role === role);
    document.body.classList.add("embedded");
    if (slot) slot.append(el("span", "session-user", account.name + " · " + account.title));
    return true;
  }

  const session = currentSession();
  if (!session || session.role !== role) {
    window.location.replace("index.html");
    return false;
  }

  if (slot) {
    const button = el("button", "btn outline", "Sign out");
    button.type = "button";
    button.addEventListener("click", signOut);
    // "Admin · Admin" would read oddly, so the role is added only when it differs
    const label = session.name === session.title ? session.name : session.name + " · " + session.title;
    slot.append(el("span", "session-user", label), button);
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

  accounts.forEach((account) => {
    const button = el("button", "demo-account");
    button.type = "button";
    button.append(el("strong", "", account.title), el("span", "mono", account.id));
    button.addEventListener("click", () => {
      userId.value = account.id;
      password.value = DEMO_PASSWORD;
      error.textContent = "";
    });
    list.append(button);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const typed = userId.value.trim().toLowerCase();
    const account = accounts.find((item) => item.id === typed);

    // one message for both cases, so the page does not reveal which IDs exist
    if (!account || password.value !== DEMO_PASSWORD) {
      error.textContent = "User ID or password is not correct. Use one of the demo accounts.";
      return;
    }

    try {
      localStorage.setItem(
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

/* ---------- side-by-side view ---------- */

// Two panes, each with a row of role tabs and a frame showing that role's
// dashboard. An action in one pane reloads the other so the effect shows.
function setUpSplitView() {
  const panes = document.querySelectorAll(".pane");
  if (panes.length === 0) return;

  const frames = [];

  panes.forEach((pane) => {
    const tabs = pane.querySelector(".pane-tabs");
    const frame = pane.querySelector("iframe");
    frames.push(frame);

    const show = (account) => {
      frame.src = account.page + "?embed=split";
      tabs.querySelectorAll("button").forEach((button) => {
        const active = button.dataset.role === account.role;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active);
      });
    };

    accounts.forEach((account) => {
      const button = el("button", "", account.title);
      button.type = "button";
      button.dataset.role = account.role;
      button.setAttribute("role", "tab");
      button.addEventListener("click", () => show(account));
      tabs.append(button);
    });

    show(accounts.find((account) => account.role === pane.dataset.start));
  });

  window.addEventListener("message", (event) => {
    if (event.data !== "cms-state-changed") return;
    frames.forEach((frame) => {
      // only our own frames can trigger a refresh, and the sender is skipped
      if (frame.contentWindow !== event.source && frames.some((f) => f.contentWindow === event.source)) {
        frame.src = frame.src;
      }
    });
  });
}

function setUpReset() {
  const button = document.getElementById("reset-demo");
  if (!button) return;
  button.addEventListener("click", () => {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (error) {
      // nothing stored, nothing to clear
    }
    notifySplitView();
    window.location.reload();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (!guardPage()) return;
  setUpLogin();
  setUpSplitView();
  setUpReset();
  renderFees();
  renderHallTickets();
  renderAttendance();
  setUpProjectCheck();
  renderOdApprovals();
  renderBlueprint();
  renderDesks();
});
