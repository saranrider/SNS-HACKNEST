// A very small database: one JSON file on disk, loaded into memory.
// Good enough for a demo; swap for Postgres or SQLite before real use.
const fs = require("node:fs");
const path = require("node:path");
const { seedDatabase, seedRecords } = require("./seed");

function createStore(file) {
  let data;

  if (file && fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
    // a file written by an older version may lack newer kinds of record
    const fresh = seedRecords();
    for (const key of Object.keys(fresh)) {
      if (!(key in data)) data[key] = fresh[key];
    }
  } else {
    data = seedDatabase();
  }

  function save() {
    if (!file) return; // in-memory store, used by the tests
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // write to a temporary file first so a crash cannot leave half a file
    fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2));
    fs.renameSync(file + ".tmp", file);
  }

  save();
  return { data, save };
}

module.exports = { createStore };
