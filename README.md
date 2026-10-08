# College Management System: UI prototype (PS06)

Static, clickable screens for the five roles in our workflow diagram. Open `index.html` in a browser; there is no build step and no server.

## Files

| File | What it is |
|---|---|
| `index.html` | Student dashboard |
| `staff.html` | Staff dashboard |
| `coe.html` | Controller of Examinations dashboard |
| `admin.html` | Admin and Support dashboard |
| `alumni.html` | Alumni dashboard |
| `styles.css` | Shared blue and white theme |
| `app.js` | Sample data and page logic |

## What works

- The top bar switches between roles.
- Student: the attendance table and shortage meter are calculated in `app.js` from the `courses` array, using the 75% rule.
- Student: Project follow-up compares a new proposal (title, abstract, graphical abstract) with the `pastProjects` array. A match unlocks the earlier project's files and the student continues it; otherwise it is registered as new. Matching is on title and abstract keywords; the image is attached but not compared yet.
- Staff: the Approve button on OD requests updates the row and the waiting count. The blueprint bars are drawn from the `blueprint` object.
- Admin: the no-dues table finds the slowest desk from the `desks` array.

Everything else is static markup. All names, marks and counts are sample data.

## Publishing

Repository Settings, Pages, deploy from branch `main`, folder `/docs`.
