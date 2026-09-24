# Digizag Brain — Frontend Demo

A standalone, frontend-only copy of the Digizag Brain interface. It has no login page, backend, API routes, Supabase project, database, or external account connections.

The screens use sample data and local in-memory interactions so the interface can be explored without configuration. Refreshing the page resets demo content; theme and display preferences are stored in the browser.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build a static site

```bash
npm run build
```

The static site is written to `out/` and can be hosted by any static file server.

## Included demo interactions

- Chat messages and “remember” notes
- Local file selection and memory rows
- Memory search, filtering, editing, and deletion
- Simulated Gmail/Pumble connection and sync states
- Local user-management controls
- Theme and workspace preference controls

None of these actions send data to a server.
