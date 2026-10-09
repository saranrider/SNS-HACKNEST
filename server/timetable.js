// The weekly timetable used to check a class alteration. A class can only
// be handed to a colleague who has no class of their own in that period.
// Sample data: a real system would read this from the college timetable.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Each staff member's classes, by user ID: day -> period -> class.
const classes = {
  saran: {
    Mon: { 1: "Database Systems · II MCA", 3: "Data Structures · I MCA", 5: "Database Systems lab · II MCA", 7: "Data Structures · I MCA" },
    Tue: { 2: "Database Systems · II MCA", 4: "Data Structures · I MCA", 6: "Database Systems lab · II MCA" },
    Wed: { 1: "Data Structures · I MCA", 3: "Database Systems · II MCA", 5: "Data Structures lab · I MCA" },
    Thu: { 2: "Database Systems · II MCA", 5: "Data Structures · I MCA", 7: "Database Systems · II MCA" },
    Fri: { 1: "Data Structures · I MCA", 4: "Database Systems · II MCA", 6: "Data Structures · I MCA" },
    Sat: { 2: "Database Systems · II MCA", 3: "Data Structures · I MCA" },
  },
  raja: {
    Mon: { 1: "Operating Systems · II MCA", 2: "Software Engineering · I MCA", 6: "Operating Systems lab · II MCA", 8: "Software Engineering · I MCA" },
    Tue: { 1: "Software Engineering · I MCA", 2: "Operating Systems · II MCA", 3: "Operating Systems lab · II MCA", 7: "Software Engineering · I MCA" },
    Wed: { 2: "Operating Systems · II MCA", 4: "Software Engineering · I MCA", 6: "Operating Systems · II MCA" },
    Thu: { 1: "Software Engineering · I MCA", 4: "Operating Systems · II MCA", 6: "Software Engineering lab · I MCA" },
    Fri: { 2: "Operating Systems · II MCA", 3: "Software Engineering · I MCA", 5: "Operating Systems · II MCA" },
    Sat: { 1: "Software Engineering · I MCA", 4: "Operating Systems · II MCA" },
  },
  gopika: {
    Mon: { 2: "Digital Marketing · II MCA", 4: "Web Technology · I MCA", 7: "Digital Marketing · II MCA" },
    Tue: { 2: "Web Technology · I MCA", 5: "Digital Marketing · II MCA", 7: "Web Technology lab · I MCA", 8: "Digital Marketing · II MCA" },
    Wed: { 1: "Web Technology · I MCA", 2: "Digital Marketing · II MCA", 7: "Web Technology · I MCA" },
    Thu: { 3: "Digital Marketing · II MCA", 5: "Web Technology · I MCA", 8: "Digital Marketing · II MCA" },
    Fri: { 1: "Digital Marketing · II MCA", 2: "Web Technology · I MCA", 7: "Web Technology lab · I MCA" },
    Sat: { 2: "Digital Marketing · II MCA", 3: "Web Technology · I MCA" },
  },
};

// "2026-10-12" -> { day: "Mon", label: "Mon 12 Oct 2026" }, or null.
function readDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const date = new Date(match[0] + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(match[3])) return null;
  const day = DAYS[date.getUTCDay()];
  return { day, label: day + " " + Number(match[3]) + " " + MONTHS[Number(match[2]) - 1] + " " + match[1] };
}

const classesOf = (userId) => classes[userId] || {};

// The periods in which each of the other staff members is teaching.
function busyPeriods(userId) {
  const busy = {};
  for (const day of Object.keys(classesOf(userId))) busy[day] = Object.keys(classes[userId][day]).map(Number);
  return busy;
}

// Checks an alteration asked for by one staff member of another.
// "taken" lists slots already promised: [{ slot: "2026-10-12#1", userId }].
// Returns { error } or { slot, text }.
function checkAlteration(asker, colleague, dateValue, periodValue, taken) {
  const date = readDate(dateValue);
  if (!date) return { error: "Choose the date of the class." };
  const period = Number(periodValue);
  const own = classesOf(asker.id)[date.day] || {};
  if (!Number.isInteger(period) || !own[period]) {
    return { error: "You have no class in that period on " + date.label + "." };
  }
  if (!colleague || colleague.role !== "staff" || colleague.id === asker.id) {
    return { error: "Choose the colleague who will take the class." };
  }
  const slot = dateValue + "#" + period;
  if (taken.some((item) => item.slot === slot && item.userId === asker.id)) {
    return { error: "That class already has an alteration.", clash: true };
  }
  const teaching = Boolean((classesOf(colleague.id)[date.day] || {})[period]);
  const covering = taken.some((item) => item.slot === slot && item.userId === colleague.id);
  if (teaching || covering) {
    const why = teaching ? " has a class" : " is already covering another class";
    return { error: colleague.name + why + " in period " + period + " on " + date.label + ". Choose someone who is free." };
  }
  const where = "Period " + period + " on " + date.label;
  return { slot, text: where + " (" + own[period] + ") goes to " + colleague.name + ", who is free in that period" };
}

module.exports = { classes, classesOf, busyPeriods, checkAlteration, readDate };
