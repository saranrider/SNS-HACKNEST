# PSNA Hacknext (PS06)

A college management prototype built for PSNA College of Engineering & Technology: one shared record for students, staff, the examinations office, the college office and alumni.

- `docs/` holds the pages (HTML, CSS, JavaScript). See `docs/README.md`.
- `server/` holds the backend (Node.js and Express).

## Run it with the backend

You need Node.js 18 or newer.

```
cd server
npm install
npm start
```

Then open http://localhost:3000 and sign in with a demo account (the IDs are on the sign-in page; the password is `demo1234`).

With the server running:

- the password is checked on the server, and five wrong attempts lock that ID for a minute;
- records are stored on the server (`server/data/db.json`), so two people on two devices see each other's actions within a few seconds;
- the courses, OD requests and desk figures the pages show are read from the server;
- only Staff can approve an OD request, and only Admin can record a fee or close a support ticket; the server refuses anyone else;
- a student's query or a staff member's campus issue is saved as a ticket that the Admin's support desk sees and closes;
- every approval and payment is written to an audit log.

## Run it without the backend

Open `docs/index.html` in a browser, or host `docs/` on GitHub Pages. The pages notice there is no server and keep everything in that one browser. The footer of each dashboard says which mode it is in.

## API

All paths except `/api/health` and `/api/login` need the header `Authorization: Bearer <token>`.

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/health` | anyone | Says the server is up |
| `POST /api/login` | anyone | Body `{ id, password }`; returns a token, role and name |
| `POST /api/logout` | signed in | Ends the session |
| `GET /api/state` | signed in | Which OD requests are approved, whether the demo fee is paid, and the support tickets |
| `GET /api/records` | signed in | Courses, OD requests and desk figures |
| `POST /api/tickets` | signed in | Body `{ text, owner }`; raises a query or campus issue |
| `POST /api/tickets/close` | Admin | Body `{ id }`; closes that ticket |
| `POST /api/od/approve` | Staff | Body `{ student }`; approves that OD request |
| `POST /api/fees/pay` | Admin | Body `{ student }`; records that fee as paid |
| `GET /api/audit` | Admin, COE | The last 50 actions |
| `POST /api/reset` | signed in | Puts the demo records back to the start |

## Tests

```
cd server
npm test
```

## Putting it online

`render.yaml` describes the server for Render (render.com): choose New, then Blueprint, pick this repository, and Render builds and starts it. The one address then serves both the pages and the API. On the free plan the disk is not kept, so the records go back to the starting data whenever the service restarts.

## Hosting the server elsewhere

If the pages are on GitHub Pages and the server is on another address, set that address in `docs/config.js`, and start the server with `ALLOWED_ORIGIN` set to the pages' address (for example `https://saranrider.github.io`).

## Limits of this prototype

- The data is sample data, and the store is a single JSON file, which suits a demo and not real use.
- Sessions are kept in memory, so restarting the server signs everyone out.
- Some lists on the pages (assignments, circulars, syllabus status and similar) are still fixed sample text in the HTML.
- The side-by-side view signs each pane in with that role's demo account so it can be shown without a sign-in step.
