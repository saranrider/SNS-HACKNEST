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

// Projects completed by earlier batches. A new proposal is compared with these.
const pastProjects = [
  {
    title: "Smart attendance system using face recognition",
    year: 2024,
    team: "Batch 6, MCA 2022-24",
    guide: "Dr. Meena K",
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
  setUpProjectCheck();
  renderOdApprovals();
  renderBlueprint();
  renderDesks();
});
