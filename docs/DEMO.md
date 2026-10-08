# Demo script (about three minutes)

Before you start: run the server (`cd server && npm start`), open `http://localhost:3000`, and press "Reset demo data" at the bottom of any dashboard. Keep `split.html` open in a second tab. The password for every account is `demo1234`.

| Time | Do this | Say this |
|---|---|---|
| 0:00 | Sign in as `devi`. | Devi's hall ticket is held: attendance is 74.5%, under the 75% line, and one fee is due. |
| 0:30 | Open the side-by-side view, Staff on the left and Student on the right. Approve Devi's OD request. | Staff approves once. Her attendance moves to 77.6% on her own page, with no form carried anywhere. |
| 1:10 | Switch the left pane to Admin and record the fee payment. | The accounts desk clears by itself, no dues becomes 4 / 4, and the hall ticket is ready on both the Student and COE pages. |
| 1:50 | On the Student pane, send a query to a desk. Show the Admin support desk, then close the ticket. | A query is a ticket with one owner, and the sender sees it close. |
| 2:20 | On the Student page, submit a project proposal with a title close to the 2024 face recognition attendance project. | The proposal matches an earlier project, so its files open and the student continues that work. |
| 2:50 | Stop. | Enter it once, and every role sees it. |

## If a judge asks

- **Is the data real?** No. Every name, mark and count is sample data.
- **How is it stored?** In a JSON file on the server. A database is the next step.
- **Is the project matching done on images?** Not yet. It compares title and abstract keywords; the graphical abstract is attached but not compared.
- **What about security?** Passwords are hashed on the server, each route checks the role, sign-in locks for a minute after five wrong attempts, and actions go to an audit log. Opened without the server, the pages only imitate sign-in in the browser.
