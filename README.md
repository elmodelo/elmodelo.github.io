# elModelo

React app built with Vite and Supabase.

## Local development

Use Node.js 24. Copy `.env.example` to `.env.local` and fill in your Supabase
project URL and public anon key, then run:

```sh
npm ci
npm run dev
```

Run `npm run build` to generate `dist/` and `npm run preview` to preview it.
Run `npm test` for the local component and transaction-query checks.

After signing in, use the main menu to browse transactions, view the account
email and sign out. Settings sets the theme, language, and tracked accounts. Tracked accounts
are listed by name with checkboxes and saved per user in browser storage. All accounts are
tracked until the first edit; unchecking every account shows no transactions.
`Dashboard` owns `useTrackedAccounts(userId)` and passes its `trackedAccountIds: string[]`
to panels, which can use the IDs in `.in('account', trackedAccountIds)` filters.
Wait for the hook's `ready` status before querying, and treat an empty list as no results.
A value saved in the browser's local
storage is always used; otherwise the system preference applies. Transactions are sorted and
paginated by the database, initially showing the newest 50; the page size and
sort column can be changed in the panel. Dates are displayed in UTC and amounts
use the account currency.

The Supabase Data API must expose the `finance` schema, with the finance
migrations applied. Transaction access uses the signed-in user's existing
database grants and row-level security policies.

## Dashboard panels

Use a `section.dashboard-panel` inside `.dashboard-content` for each panel.
Place its heading and any footer controls directly inside the section, and wrap
the content that should scroll in a `.panel-scroll` element. Give the scroll
region `tabIndex={0}`, `role="region"`, and an accessible label (for example,
`aria-labelledby` pointing to the heading).

The shared dashboard layout keeps the page header and menu visible, fits the
card to short content, and limits tall cards to the available viewport height.
Only `.panel-scroll` scrolls; headings and footer controls stay visible. Table
column headers inside a scroll region stay pinned automatically.

## GitHub Pages

[The deployment workflow](.github/workflows/deploy.yml) builds and deploys the
site on every push to `main`. It can also be started manually from the repository's
Actions tab using **Run workflow**.

One-time repository configuration:

This repository is public and uses GitHub Pages with GitHub Actions. The two
Supabase repository secrets are configured. For a new repository, follow these
setup steps:

1. In **Settings → Pages → Build and deployment**, select **GitHub Actions** as
   the source.
2. In **Settings → Secrets and variables → Actions**, create these repository
   secrets using the same values as your local environment:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Commit and push the workflow to `main`.

The published site is https://elmodelo.github.io/. Vite's default base path `/`
is correct for this repository. The workflow installs locked dependencies with
`npm ci`, builds the app, and deploys only `dist/`; no `gh-pages` branch is needed.

Vite embeds these Supabase values in the public JavaScript bundle. Use only the
public anon key, never a Supabase service role key. Supabase row-level security
policies must enforce data access.

Deployment follows the official [Vite GitHub Pages guide](https://vite.dev/guide/static-deploy.html#github-pages)
and [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
