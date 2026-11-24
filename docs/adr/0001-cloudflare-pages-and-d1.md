# Cloudflare Pages with Functions and D1 for hosting and storage

GitHub Pages only serves static files, so it cannot store a draw that every participant reads. We host on Cloudflare Pages, with Pages Functions as the API and D1 (SQLite) as storage: it is free, deploys from a GitHub push, and keeps frontend and API in one repo. Because all access goes through our own API, the server can enforce that each participant sees only their own assignment.

## Considered Options

- **GitHub Pages + Firebase/Supabase**: the browser talks to the database directly, so secrecy depends on getting security rules right.
- **Static page with a downloadable list**: the list holds every assignment, so whoever has it knows everything.
