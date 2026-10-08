// Starting data for the demo. The users match the accounts shown on the
// sign-in page; the records match the sample data in docs/app.js.
const crypto = require("node:crypto");

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo1234";

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

function makeUser(id, role, name, title) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { id, role, name, title, salt, hash: hashPassword(DEMO_PASSWORD, salt) };
}

function seedRecords() {
  return {
    courses: [
      { code: "MC1301", name: "Data Structures", held: 40, attended: 33 },
      { code: "MC1302", name: "Database Systems", held: 42, attended: 30 },
      { code: "MC1337", name: "Digital Marketing", held: 36, attended: 27 },
      { code: "MC1304", name: "Operating Systems", held: 38, attended: 29 },
      { code: "MC1305", name: "Software Engineering", held: 40, attended: 27 },
    ],
    odRequests: [
      {
        student: "Devi",
        event: "Internal hackathon · 6 Oct",
        periods: 6,
        attended: 146,
        held: 196,
        byCourse: { MC1302: 3, MC1305: 3 },
        status: "pending",
      },
      { student: "Divya S", event: "Zonal volleyball · 5 Oct", periods: 7, attended: 150, held: 196, status: "pending" },
      { student: "Arun P", event: "Placement drive · 7 Oct", periods: 4, attended: 158, held: 196, status: "pending" },
    ],
    desks: [
      { name: "Library", autoCleared: 41, open: 2, waitDays: 0.4 },
      { name: "Laboratory", autoCleared: 44, open: 1, waitDays: 0.3 },
      { name: "Hostel", autoCleared: 18, open: 3, waitDays: 1.2 },
      { name: "Accounts", autoCleared: 36, open: 6, waitDays: 2.6 },
    ],
    tickets: [],
    fees: [
      { student: "Devi", item: "Exam fee", status: "due" },
      { student: "Priya D", item: "Second instalment", status: "due" },
      { student: "Vignesh A", item: "Hostel fee", status: "due" },
    ],
    audit: [],
  };
}

function seedDatabase() {
  return Object.assign(
    {
      users: [
        makeUser("devi", "student", "Devi", "Student"),
        makeUser("saran", "staff", "Saran", "Staff"),
        makeUser("brundha", "coe", "Brundha", "COE"),
        makeUser("admin", "admin", "Admin", "Admin"),
        makeUser("alumni", "alumni", "Alumni", "Alumni"),
      ],
    },
    seedRecords()
  );
}

module.exports = { seedDatabase, seedRecords, hashPassword };
