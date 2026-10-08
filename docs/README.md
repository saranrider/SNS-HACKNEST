# College Management System: UI prototype (PS06)

A Prototype built for PSNA College of Engineering & Technology.

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
| `split.html` | Two dashboards side by side, each with role tabs |
| `images/` | One picture per role, used on the sign-in tiles and in the top bar |
| `styles.css` | Shared blue and white theme |
| `app.js` | Sample data and page logic |

## Signing in

Use a demo account. The password for all of them is `demo1234`.

| Role | User ID |
|---|---|
| Student | `devi` |
| Staff | `saran` |
| COE | `brundha` |
| Admin | `admin` |
| Alumni | `alumni` |

Each dashboard opens only for its own role; anyone else is sent back to the sign-in page. This is a demonstration of the flow, not real security: the check runs in the browser and the password is in `app.js`. A real version needs a server to verify credentials.

## Side-by-side view

`split.html` shows two dashboards next to each other, each with tabs to pick the role. An action in one pane refreshes the other, so approving an OD request as Staff on the left changes the Student page on the right straight away. It opens without signing in, as a presenter view for the demo; it is linked from the sign-in page.

## The pages are connected

Actions are saved in the browser (`localStorage`) and read by every page, so one student's case can be followed across roles:

1. Staff approves Devi's OD request: his attendance on the Student page moves from 74.5% to 77.6%, and the COE hall ticket row drops the "OD pending" reason.
2. Admin records his fee payment: the accounts desk clears, no dues becomes 4 / 4, and the hall ticket shows "Ready to issue" on both the Student and COE pages.
3. "Reset demo data" at the bottom of any page puts everything back.

## What works

- The top bar shows who is signed in and has Sign out.
- Student: the readiness panel at the top shows the two conditions for the hall ticket (attendance against the 75% line, and the four no-dues desks) and the ticket itself, which fills in once both are met.
- Student: the attendance table and shortage meter are calculated in `app.js` from the `courses` array, using the 75% rule.
- Student: Project follow-up compares a new proposal (title, abstract, graphical abstract) with the `pastProjects` array. A match unlocks the earlier project's files and the student continues it; otherwise it is registered as new. Matching is on title and abstract keywords; the image is attached but not compared yet.
- Staff, COE and Admin: an overview panel at the top states the position in one sentence and shows each queue as a row of segments, one per item (blue done, pale still to come, red needs action). Hover a segment to see which item it is.
- Staff: the Approve button on OD requests updates the row and the overview. The blueprint bars are drawn from the `blueprint` object.
- Admin: the no-dues table finds the slowest desk from the `desks` array.

Everything else is static markup. All names, marks and counts are sample data.

## Publishing

Repository Settings, Pages, deploy from branch `main`, folder `/docs`.
