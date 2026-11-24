# W-Wichteln

A Secret Santa app for groups of friends: people join a group, the organizer draws who gives a present to whom, and each person sees only their own recipient.

It runs on Cloudflare Pages, with Pages Functions as the API and D1 as storage (see [ADR 0001](docs/adr/0001-cloudflare-pages-and-d1.md)). Domain terms are defined in [GLOSSARY.md](GLOSSARY.md).

## Run it locally

You need **Node.js 22.12 or newer** and Git. You don't need a Cloudflare account for local work.

```sh
git clone https://github.com/RuiHnr/w-wichteln.git
cd w-wichteln
npm ci
npm run dev
```

`npm run dev` applies the D1 migrations to a local database in `.wrangler/`, builds the frontend, and serves frontend and API together. Open <http://localhost:8788>. The API should answer at <http://localhost:8788/api/health> with `{"status":"ok"}`. Frontend changes rebuild and reload on their own.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Run the Vitest suite once |
| `npm run typecheck` | Typecheck the frontend and the functions |
| `npm run build` | Build the frontend into `dist/` |
| `npm run db:migrate:local` | Apply pending migrations to the local database |

To start over with an empty local database, delete `.wrangler/` and run `npm run dev` again.

## Deploy to Cloudflare

Do these steps once, in this order. You end up with the app live at `https://w-wichteln.pages.dev`, redeployed on every push to `main`.

### 1. Log in to Cloudflare

Create a free account at <https://dash.cloudflare.com/sign-up> if you don't have one. Then run:

```sh
npx wrangler login
```

A browser window opens. Allow access, then come back to the terminal. `npx wrangler whoami` shows the account you're logged in to.

### 2. Create the D1 database

```sh
npx wrangler d1 create w-wichteln
```

The output includes a `database_id`. Copy it into `wrangler.toml` in place of the placeholder zeros:

```toml
[[d1_databases]]
binding = "DB"
database_name = "w-wichteln"
database_id = "<your database_id>"
migrations_dir = "migrations"
```

Keep `binding` and `database_name` as they are. If Wrangler offers to add the database to your config itself, decline, so `wrangler.toml` keeps this one block.

### 3. Apply the migrations remotely

```sh
npm run db:migrate:remote
```

Confirm with `y` when Wrangler lists the migrations. `npx wrangler d1 migrations list w-wichteln --remote` should then report no pending migrations.

### 4. Commit the database id and push

```sh
git add wrangler.toml
git commit -m "Set D1 database id"
git push
```

The id is not a secret: only your logged-in account can use it.

### 5. Connect the Pages project to GitHub

1. In the [Cloudflare dashboard](https://dash.cloudflare.com), open **Workers & Pages** and choose **Create application**.
2. Pick **Pages**, then **Import an existing Git repository**. Do not use *Direct Upload*: a project created that way can never be connected to Git.
3. Authorise the Cloudflare GitHub app for your account, give it access to the `w-wichteln` repository, and select it.
4. Set the build settings:
   - **Project name**: `w-wichteln`
   - **Production branch**: `main`
   - **Framework preset**: None
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Under **Environment variables**, add `NODE_VERSION` = `22` so the build uses a Node version that Vite supports.
6. Choose **Save and Deploy**.

The project name sets the address. If `w-wichteln` is already taken, Cloudflare gives you `w-wichteln-<suffix>.pages.dev` instead. Pick a fallback such as `w-wichteln-app` if you'd rather choose it yourself. Nothing in the code depends on the address.

### 6. Check the D1 binding

You don't add the binding by hand. Because `wrangler.toml` contains `pages_build_output_dir`, Cloudflare reads the D1 binding from it on every deploy, using the `database_id` you committed in step 4.

To check it, open the Pages project, go to **Settings → Bindings**, and confirm that a D1 binding named `DB` points at `w-wichteln`. The dashboard shows bindings as read-only because the file is the source of truth. Then open `https://<your-project>.pages.dev/api/health`: it should answer `{"status":"ok"}`.

If the first deploy ran before the database id was committed, go to **Deployments** and retry the latest deployment.

## Deploying changes

Every push to `main` deploys to production. Pushes to other branches deploy a preview at `https://<branch>.<your-project>.pages.dev`. Previews use the **same** D1 database as production.

> **Run remote migrations before you deploy a change that needs them.** Pages deploys code only, never migrations. If a change adds a file in `migrations/`, run `npm run db:migrate:remote` before you push or merge it to `main`. Otherwise the new code runs against the old schema. Write migrations so the currently deployed code keeps working after they run, for example by adding tables and columns rather than renaming them.

Typical flow for a change with a migration:

```sh
npm run db:migrate:local    # try it locally first (npm run dev also does this)
npm test
npm run db:migrate:remote   # then migrate production
git push                    # then deploy the code
```
