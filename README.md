# PSNA Hacknext: UI prototype (PS06)

A Prototype built for PSNA College of Engineering & Technology.

Clickable screens for the five roles in our workflow diagram. They work on their own (open `index.html` in a browser) and, when served by the backend in `../server`, they use it for sign-in and shared records. See the README at the top of the repository.

## Files

| File | What it is |
|---|---|
| `index.html` | Sign-in page |
| `student.html` | Student dashboard |
| `staff.html` | Staff dashboard |
| `coe.html` | Controller of Examinations dashboard |
| `admin.html` | Admin and Support dashboard |
| `alumni.html` | Alumni dashboard |
| `images/` | One picture per role, used on the sign-in tiles and in the top bar |
| `styles.css` | Shared blue and white theme |
| `app.js` | Sample data and page logic |
| `config.js` | The backend's address, when it is hosted separately |

## Signing in

Choose who is signing in, then type that person's user ID and password. The password for every demo account is `demo1234`.

| Role | User ID |
|---|---|
| Student | `devi` |
| Staff | `saran`, `raja`, `gopika` |
| COE | `brundha` |
| Admin | `admin` |
| Alumni | `alumni` |

Each sign-in has its own access and nothing else:

- An account is accepted only at its own role's sign-in. A student ID typed under Staff is refused.
- Each dashboard opens only for its own role; anyone else is sent back to the sign-in page. There is no page that shows two roles together.
- The sign-in belongs to the browser tab, so two tabs can hold two different people.
- With the backend running, the password is checked on the server, and the server sends each role only its own share of the records: a student gets her own OD request and her own tickets, not her classmates'. Without the backend the check runs in the browser, which shows the flow but is not real security.

## Notifications

Every acceptance tells the people it concerns, within about three seconds. A "Notifications" button in the top bar shows the unread count, and a new message also pops up at the bottom of the page.

| When | Who is told |
|---|---|
| Staff approve an OD request | The student |
| Admin records a fee payment | The student |
| Attendance and dues are both clear | The student and the COE |
| The COE issues the hall ticket | The student |
| A student or staff member raises a request | The admin |
| Admin closes the request | The person who raised it |
| The COE approves a syllabus | Staff |
| The COE verifies marks for a certificate | The admin and the alumnus |
| Admin issues the certificate | The alumnus |
| Staff accept a project proposal | The student |
| A student sends a new OD request | Staff; the student is told when it is approved |
| Staff ask a colleague to take a class | That colleague only; on acceptance, the one who asked and the admin are told |
| An alumnus asks for a certificate, a business listing or a record update | The admin; the alumnus is told when it is done |
| An alumnus posts a referral or offers mentoring | The admin; on publishing, the alumnus and the students are told |

An element that is waiting on another role shows who has the next step when you hover over it (marked `data-followup` in the HTML). It does not open that role's page.

## Every button does something

No control on any dashboard is decorative. A button either acts at once (approve, issue, verify, mark, record), opens a short form whose result goes to the role that must accept it (new OD request, duty change, certificate request, referral, mentoring, business listing, record update), or searches (the alumni directory). The one disabled button, "Send to COE after fixing gaps" on the Staff page, is disabled on purpose because the draft paper fails the blueprint check.

A new OD request asks for the event and a From and To date and time; the end must be later than the start, and the server checks this as well as the page. It is recorded and approved, but it does not change the attendance figures: only the sample hackathon request carries per-course periods.

Requests go one step up. A student's "Request hall ticket" goes to the COE, who can issue it only once attendance and dues are clear. "Submit" on an assignment goes to staff. The "Requests" card on each dashboard takes anything else and sends it to that person's superior: student to class advisor, staff to COE, COE and alumni to the admin office. The person it is sent to sees it under "Sent to you" and accepts it there.

On the Staff page, "Your in and out times" lists each working day's in time, out time and hours, and only that staff member's own times are sent to the page. "Duty alteration" asks a colleague to take a class during leave: choose the date, then one of your own periods that day, and the list offers only the other staff members who have no class in that period and are not already covering another class then. The request goes to that colleague alone, who accepts it on their own page; the one who asked and the office are then told. If nobody is free the request cannot be sent, the same class cannot be altered twice, and the server repeats all of these checks. Each of the three staff accounts has its own timetable and its own in and out times. The timetable is sample data held in `server/timetable.js`.

The module menu runs along the top of each dashboard and stays in view while scrolling.

## The pages are connected

Actions are stored once and each role sees its own side of them. With the backend they are in the database and shared across devices; without it they are kept in the browser (`localStorage`), shared by the tabs of that one browser:

1. Staff approves Devi's OD request: her attendance moves from 74.5% to 77.6% and she is notified.
2. Admin records her fee payment: the accounts desk clears, no dues becomes 4 / 4, and both she and the COE are told that the hall ticket is ready.
3. The COE presses "Issue to all eligible": her hall ticket shows "Issued" and she is notified. Before both conditions are met the COE is told she is still on hold.
4. The COE verifies an alumna's marks, the admin issues the transcript, and the alumni tracker moves a step each time.
5. A student sends a query, or staff report a campus issue: it appears at the admin's support desk, and the sender is told when it is closed.
6. "Reset demo data" at the bottom of any page puts everything back.

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
