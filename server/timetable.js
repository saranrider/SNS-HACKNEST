// The weekly timetable used to check a class alteration. A class can only
// be handed to a colleague who has no class of their own in that period.
// Sample data: a real system would read this from the college timetable.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PERIODS_PER_DAY = 8;

// The signed-in staff member's own classes: day -> period -> class.
const ownClasses = {
  Mon: { 1: "Database Systems · II MCA", 3: "Data Structures · I MCA", 5: "Database Systems lab · II MCA", 7: "Data Structures · I MCA" },
  Tue: { 2: "Database Systems · II MCA", 4: "Data Structures · I MCA", 6: "Database Systems lab · II MCA" },
  Wed: { 1: "Data Structures · I MCA", 3: "Database Systems · II MCA", 5: "Data Structures lab · I MCA" },
  Thu: { 2: "Database Systems · II MCA", 5: "Data Structures · I MCA", 7: "Database Systems · II MCA" },
  Fri: { 1: "Data Structures · I MCA", 4: "Database Systems · II MCA", 6: "Data Structures · I MCA" },
  Sat: { 2: "Database Systems · II MCA", 3: "Data Structures · I MCA" },
};

// Colleagues: day -> the periods in which they are teaching.
const colleagueBusy = {
  "Mr. Ravi T": { Mon: [1, 2, 5, 6], Tue: [1, 2, 3, 7], Wed: [2, 3, 4, 6], Thu: [1, 2, 4, 6], Fri: [1, 2, 3, 5], Sat: [1, 2] },
  "Ms. Shalini G": { Mon: [2, 3, 4, 7], Tue: [2, 4, 5, 6], Wed: [1, 2, 5, 7], Thu: [3, 4, 5, 7], Fri: [2, 4, 6, 7], Sat: [3, 4] },
  "Mr. Karthik R": { Mon: [1, 3, 6, 8], Tue: [1, 2, 3, 5, 8], Wed: [1, 3, 4, 8], Thu: [2, 5, 6, 8], Fri: [1, 4, 5, 8], Sat: [1, 2, 3] },
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

function freeColleagues(day, period) {
  return Object.keys(colleagueBusy).filter((name) => !(colleagueBusy[name][day] || []).includes(period));
}

// Checks a requested alteration. Returns { error } or { slot, text }.
function checkAlteration(dateValue, periodValue, colleague) {
  const date = readDate(dateValue);
  if (!date) return { error: "Choose the date of the class." };
  const period = Number(periodValue);
  const classes = ownClasses[date.day] || {};
  if (!Number.isInteger(period) || !classes[period]) {
    return { error: "You have no class in that period on " + date.label + "." };
  }
  if (!Object.prototype.hasOwnProperty.call(colleagueBusy, colleague)) {
    return { error: "Choose the colleague who will take the class." };
  }
  if (!freeColleagues(date.day, period).includes(colleague)) {
    return { error: colleague + " has a class in period " + period + " on " + date.label + ". Choose someone who is free." };
  }
  const slot = "Period " + period + " on " + date.label;
  return { slot, text: slot + " (" + classes[period] + ") goes to " + colleague + ", who is free in that period" };
}

module.exports = { ownClasses, colleagueBusy, checkAlteration, freeColleagues, readDate, PERIODS_PER_DAY };
