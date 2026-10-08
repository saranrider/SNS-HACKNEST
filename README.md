# College Management System: UI prototype (PS06)

A student hackathon prototype built for PSNA College of Engineering & Technology. It is not an official college system.

Static, clickable screens for the five roles in our workflow diagram. Open `index.html` in a browser; there is no build step and no server.

## Files

| File | What it is |
|---|---|
| `index.html` | Sign-in page |
| `student.html` | Student dashboard |
| `staff.html` | Staff dashboard |
| `coe.html` | Controller of Examinations dashboard |
| `admin.html` | Admin and Support dashboard |
| `alumni.html` | Alumni dashboard |
| `styles.css` | Shared blue and white theme |
| `app.js` | Sample data and page logic |

## Signing in

Use a demo account. The password for all of them is `demo1234`.

| Role | User ID |
|---|---|
| Student | `karthik` |
| Staff | `meena` |
| COE | `coe` |
| Admin | `office` |
| Alumni | `lakshmi` |

Each dashboard opens only for its own role; anyone else is sent back to the sign-in page. This is a demonstration of the flow, not real security: the check runs in the browser and the password is in `app.js`. A real version needs a server to verify credentials.

## The pages are connected

Actions are saved in the browser (`localStorage`) and read by every page, so one student's case can be followed across roles:

1. Staff approves Karthik's OD request: his attendance on the Student page moves from 74.5% to 77.6%, and the COE hall ticket row drops the "OD pending" reason.
2. Admin records his fee payment: the accounts desk clears, no dues becomes 4 / 4, and the hall ticket shows "Ready to issue" on both the Student and COE pages.
3. "Reset demo data" at the bottom of any page puts everything back.

## What works

- The top bar shows who is signed in and has Sign out.
- Student: the readiness panel at the top shows the two conditions for the hall ticket (attendance against the 75% line, and the four no-dues desks) and the ticket itself, which fills in once both are met.
- Student: the attendance table and shortage meter are calculated in `app.js` from the `courses` array, using the 75% rule.
- Student: Project follow-up compares a new proposal (title, abstract, graphical abstract) with the `pastProjects` array. A match unlocks the earlier project's files and the student continues it; otherwise it is registered as new. Matching is on title and abstract keywords; the image is attached but not compared yet.
- Staff: the Approve button on OD requests updates the row and the waiting count. The blueprint bars are drawn from the `blueprint` object.
- Admin: the no-dues table finds the slowest desk from the `desks` array.

Everything else is static markup. All names, marks and counts are sample data.

## Publishing

Repository Settings, Pages, deploy from branch `main`, folder `/docs`.
