# Demo script (about three minutes)

Before you start: run the server (`cd server && npm start`) and open `http://localhost:3000` in four browser tabs. Sign in as `devi` (Student), `saran` (Staff), `admin` (Admin) and `brundha` (COE), one per tab; each tab keeps its own sign-in. The password for every account is `demo1234`. Press "Reset demo data" at the bottom of any dashboard.

| Time | Do this | Say this |
|---|---|---|
| 0:00 | Show the Student tab. | Devi's hall ticket is held: attendance is 74.5%, under the 75% line, and one fee is due. She sees only her own page. |
| 0:25 | Staff tab: approve Devi's OD request. Switch to the Student tab. | Within three seconds she is notified, and her attendance is 77.6%. Nobody carried a form. |
| 1:00 | Admin tab: record the fee payment. Show the Student tab, then the COE tab. | The accounts desk clears by itself. Devi and the COE are both told the hall ticket is ready. |
| 1:35 | COE tab: press "Issue to all eligible". Show the Student tab. | The COE issues it, and Devi is notified that it is issued. |
| 2:00 | Student tab: send a query. Admin tab: close the ticket. | A query reaches the support desk at once, and the sender is told when it is resolved. |
| 2:30 | Student tab: submit a project proposal with a title close to the 2024 face recognition attendance project. | The proposal matches an earlier project, so its files open and the student continues that work. |
| 2:55 | Stop. | Enter it once, and the right person is told in real time. |

## If a judge asks

- **Can a student see the staff page?** No. Each account is accepted only at its own sign-in, each page opens only for its role, and the server sends each role only its own records.
- **How fast is "real time"?** Each page asks the server for changes every three seconds. Push delivery (WebSockets) is the next step.
- **How does a class alteration work?** Sign in as `saran`, choose Monday 12 Oct and period 1: only Gopika is offered, because Raja teaches then. Sign in as `gopika` in another tab and accept; Saran and the admin are both told.
- **Is the data real?** No. Every name, mark and count is sample data.
- **How is it stored?** In a SQLite database on the server, with a table for each kind of record. A database server such as PostgreSQL is the next step.
- **Is the project matching done on images?** Not yet. It compares title and abstract keywords; the graphical abstract is attached but not compared.
- **What about security?** Passwords are hashed on the server, each route checks the role, sign-in locks for a minute after five wrong attempts, and actions go to an audit log. Opened without the server, the pages only imitate sign-in in the browser.
