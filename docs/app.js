// College Management System - page behaviour.
// Every page loads this file; each section only runs if its container exists.

const MIN_ATTENDANCE = 0.75;

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
  { student: "Karthik R", event: "Internal hackathon · 6 Oct", periods: 6, attended: 146, held: 196 },
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

/* ---------- student: attendance follow-up ---------- */

function renderAttendance() {
  const body = document.getElementById("attendance-rows");
  if (!body) return;

  let held = 0;
  let attended = 0;

  courses.forEach((course) => {
    held += course.held;
    attended += course.attended;

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

  const odPeriods = odRequests[0].periods;
  const short = Math.ceil(MIN_ATTENDANCE * held - attended);

  setText("overall-attendance", percent(attended, held));
  setText("od-before", percent(attended, held));
  setText("od-after", percent(attended + odPeriods, held));
  setText(
    "overall-hint",
    short > 0 ? short + " period short of 75%" : "Above the 75% rule"
  );
}

/* ---------- staff: OD approvals ---------- */

function renderOdApprovals() {
  const body = document.getElementById("od-rows");
  if (!body) return;

  let pending = odRequests.length;
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
    const button = el("button", "btn", "Approve");
    button.type = "button";
    button.addEventListener("click", () => {
      action.replaceChildren(el("span", "pill ok", "Approved · record updated"));
      pending -= 1;
      setText("od-pending", pending);
    });
    action.append(button);
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

  const slowest = desks.reduce((a, b) => (b.waitDays > a.waitDays ? b : a));
  const totalOpen = desks.reduce((sum, desk) => sum + desk.open, 0);

  desks.forEach((desk) => {
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

document.addEventListener("DOMContentLoaded", () => {
  renderAttendance();
  renderOdApprovals();
  renderBlueprint();
  renderDesks();
});
