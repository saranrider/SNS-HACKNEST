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
    odRequests: [
      { student: "Devi", event: "Internal hackathon · 6 Oct", periods: 6, status: "pending" },
      { student: "Divya S", event: "Zonal volleyball · 5 Oct", periods: 7, status: "pending" },
      { student: "Arun P", event: "Placement drive · 7 Oct", periods: 4, status: "pending" },
    ],
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
