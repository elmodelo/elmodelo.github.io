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
email and sign out. Preferences sets the theme, language, and tracked accounts.
Apply backend migrations through `0030_app_preferences.sql` before deploying this version.
In Supabase Data API settings, expose `app` alongside `finance`. Keep `operational`
unexposed; preferences no longer requires exposing operational tables.

Preferences are loaded from `app.preferences`, with one JSON object per Auth
user. Changes save automatically after a short debounce, with saving, saved, and
retry feedback at the bottom of the dashboard across all sections. Success feedback
disappears after four seconds; errors remain visible until retry or another edit. Failed loads block the dashboard to avoid overwriting
existing preferences with defaults. Both currently allowlisted readers and writers can save their own
preferences; RLS prevents access to anyone else's preferences and denies access
after allowlist removal. Anonymous clients and importers have no access.

The shared status strip displays messages from all active workflows, newest first,
separated by dividers. Transactions publishes the full matching query count across
all pages (including zero), respecting tracked accounts and filters. Counts are
hidden during reloads or errors and removed when leaving the transactions panel.

Wrap the application in `StatusMessagesProvider`, mount `StatusBar` beneath the
panel, and publish from a workflow using `useStatusMessage`:

```tsx
useStatusMessage({ message: `${count} transactions` }); // Until this panel unmounts.
useStatusMessage({ message: 'Upload complete', tone: 'success', durationSeconds: 4 });
```

Each hook owns one message; changing it replaces that workflow's previous status
and places the new message first. Omit the message while idle. Omit `durationSeconds`
for panel lifetime, or supply a duration for timed expiry, including after leaving
the panel. Removing a message moves remaining messages left. Info, success, and
error tones and optional actions (`label`, `onClick`, `disabled`) are supported.
Keep action callbacks stable to avoid republishing unchanged messages. Workflows
own localization; the strip provides a shared polite live region and wraps on
narrow screens. `PreferencesStatus` adapts preference state to this system.

The local-storage audit found these preferences, now stored in the JSON object:

- `theme`: light/dark (system default until selected).
- `language`: English/Spanish (browser default until selected).
- `trackedAccounts`: selected account IDs (`null` tracks all; `[]` tracks none).
- `transactions`: page size, sort column, sort direction, and remembered date-sort direction.

The former guest/user browser keys and legacy `theme`/`language` keys are no
longer read or written. Existing local preferences are not imported; users start
with defaults until they save preferences to the database. Signed-out appearance
choices stay in memory. Supabase's authentication session storage is unchanged.

`Dashboard` owns `useTrackedAccounts(userId)` and passes its `trackedAccountIds`
to panels. Transactions are sorted and paginated by the database, initially
showing the newest 25. Dates use UTC and amounts use the account currency.

`TransactionsPanel` accepts `filters?: TransactionFilters` (defined in
`src/lib/transactionFilters.ts`) and an optional localized `title`. Filters are
serializable conditions combined with AND and applied by the database before
counting, sorting, and pagination. For example, a filtering panel can pass:

```tsx
const filters: TransactionFilters = [
  { field: 'category', operator: 'is', value: null },
  { field: 'posted_at', operator: 'gte', value: '2026-01-01' },
  { field: 'amount', operator: 'lt', value: 0 },
];
<TransactionsPanel messages={messages} userId={userId}
  trackedAccountIds={trackedAccountIds} filters={filters} />
```

Supported fields are `id`, `account`, `description`, `category`, `posted_at`, and
`amount`; relationship fields use IDs rather than display names. Operators are
`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in` (an array), and `is` / `not.is` (null).
Omitting filters or passing `[]` shows all tracked transactions. Filters always
intersect with tracked accounts. Changing filter values resets to the first page;
passing a new array with the same values keeps the current page. The Uncategorized
menu item uses the shared `UNCATEGORIZED_TRANSACTION_FILTERS` preset.

The Supabase Data API must expose the `finance` schema, with the finance
migrations applied. Transaction access uses the signed-in user's existing
database grants and row-level security policies.

## UI permissions

Any component inside the app can use the shared permissions hook:

```tsx
import { usePermissions } from './hooks/usePermissions';

function EditButton() {
  const { canWrite } = usePermissions();
  return canWrite ? <button>Edit</button> : null;
}
```

`usePermissions()` returns `role` (`READER`, `WRITER`, or `null`), `isReader`,
`isWriter`, `canRead`, and `canWrite`. Both roles can read; only writers can
write. Prefer `canRead` / `canWrite` for access checks, and use the role flags
when behavior depends on the exact role.

`App` supplies the role once through `PermissionsProvider`, using the current
session's access-token hook claim. Permissions update when the session refreshes
or signs out. Loading, authentication errors, missing or unknown roles, and
components outside the provider grant no permissions. Components do not need to
receive role props or create their own auth subscriptions. In isolated component
tests, wrap components with `<PermissionsProvider role="WRITER">` (or `READER`).
These checks control the UI; database grants, RLS, and RPC checks enforce access.

Categorization sends the complete selection in one call to
`finance.set_transaction_categories`, requiring migration `0026`. Category updates,
optional rule creation, and optional application to existing uncategorized
transactions are atomic for the entire selection. Database failures leave the
selection available for retry. Network failures may leave the result unknown;
retrying the same request is safe and does not duplicate rules or history.

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
