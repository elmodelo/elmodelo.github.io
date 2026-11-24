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

The last viewed panel is remembered per signed-in user in browser `localStorage`
and restored on return, including pinned transaction filters. Unknown panels or
filters that were removed or unpinned fall back to Transactions. Storage failures
do not block navigation. This setting is local to the browser.

After signing in, use the main menu to browse transactions, view the account
email and sign out. Preferences sets the theme, language, tracked accounts, and
the independent Cash Flow accounts.
Apply backend migrations through `0042_asset_writer_bridge.sql` before deploying this version.
In Supabase Data API settings, expose `app` alongside `finance`. Keep `operational`
unexposed; preferences no longer requires exposing operational tables.

Net Worth appears between Transactions and Cash Flow in the main menu. Its CAD
net worth total and allocation chart combine the latest tracked account balances
with independently tracked asset holdings. Assets are separate from account
balances and remain available when no accounts are selected. Signed account
balances and count × unit-price asset totals are summed without intermediate
rounding, using the existing Bank of Canada daily rates for USD conversion. The
status bar shows the rate and observation date. Missing snapshots mark the total
incomplete; source or conversion failures keep available data visible but suppress
the total and allocation chart until a retry succeeds. Pie slices use positive
holdings; legend percentages use the same positive CAD total as the pie slices,
normalized to 100% before display rounding. Negative balances do not reduce this
denominator, even when signed net worth is zero or negative.

The desktop layout has three columns: Net Worth above the **Liabilities** table,
then the **Assets** table, then allocation. The first column's combined height
matches the Assets card; whichever side has more content determines the height.
Allocation's height does not stretch this pair. The liabilities card expands
beneath Net Worth when the assets table is taller. On narrower panels allocation
moves below the pair; on mobile the cards stack as Net Worth, Liabilities, Assets,
and Allocation without forced equal heights.

Both tables use `NetWorthTableCard` with sortable **Date**, **Name**, **Amount**,
and **Amount (CAD)** columns. Each table has a CAD total row, summed before
display rounding and excluding rows excluded from net worth (such as disabled
RESP). Mixed native currencies are not summed. Missing included amounts,
conversion failures, or source errors show an unavailable total.
Negative accounts and declared liabilities appear
under Liabilities; positive accounts and declared assets appear under Assets.
Zero rows are hidden unless **Show inactive accounts, assets and liabilities** is
enabled. With that option enabled, zero accounts appear under Assets, while
zero assets/liabilities retain their declared type. Current accounts with
unavailable balances remain under Assets with an explicit missing-value label;
partial asset/liability histories remain under their declared type. These display
filters do not change net worth or allocation totals. Historical items without
any observations by the selected date remain omitted, even with inactive rows shown.

Asset/liability names append counts only when the actual count is greater than
1, rounded to the nearest whole unit with no decimal places, such as `INTU N (x245)`.
Stored counts, calculations and edit inputs retain their original precision. Amount is the full count × unit-price value in
the item's native currency; the final column converts it to CAD. Date shows
account balance dates or asset/liability unit-price dates in UTC. A differing
count date appears as secondary text in the same cell. Counts and prices are
selected independently. In current mode the latest snapshots may be future-dated;
historical mode applies its selected-day cutoff. USD conversion failures retain
native amounts and show an unavailable CAD amount. `AssetCard.tsx` is retained
but no longer used by this panel.

Writers can press the ellipsis button inside an asset or liability row's Name
cell to open the holding dialog directly and add a count, a unit price, or both.
These actions are hidden in historical mode. The fields start with the latest count and unit price;
a missing snapshot leaves its field blank. Blank or numerically unchanged fields are skipped and zero is
valid. Saving without changes to count or price closes the dialog without a
request or new snapshots; changing only the date also saves nothing. Observation date/time defaults to now in local time and may be backdated;
it is sent as a UTC timestamp. The dialog accepts nonnegative finite decimal
strings (decimal point), or arithmetic expressions using `+`, `-`, `*`, `/`,
and parentheses. Multiplication/division take precedence; expressions resolve
on blur or submit. Arithmetic uses exact rational calculations, preserving
terminating decimals and rounding recurring division to 20 decimal places only
at the final result. Invalid expressions, division by zero and negative final
results are rejected. Only evaluated decimal strings are sent to the RPC, and
equivalent results still skip unchanged snapshots.
`finance.add_asset_snapshot` atomically saves both observations when supplied.
Timestamp conflicts are reported without overwriting existing history. Successful
saves reload holdings, totals, and allocation. Readers have no editing controls;
the database checks the current WRITER role on every save. Apply migration `0040`
before using these features. Writers can open the small overflow menu beside the Net Worth heading and
choose **Add asset**. Its dialog requires a name, CAD/USD currency, initial count,
unit price, and observation date/time (defaulting to now). The writer-checked
`finance.create_asset` RPC creates all three rows atomically. Duplicate names are
reported without creating partial holdings. On success, cards, totals, and
allocation refresh; creating a zero holding also enables **Show inactive assets**
so the new row remains visible. Apply migrations through `0042` before using this action. Both asset write RPCs
use caller permissions and RLS with a read-only writer-check bridge, without
granting clients access to the private schema.
Readers and writers can toggle **Show inactive accounts, assets and liabilities** in the overflow menu;
only writers see **Add asset**. The menu supports keyboard navigation, Escape, and dismissal outside the menu;
there is no separate empty-state action.
The Net Worth overflow menu includes **Include RESP**, off by default. The
`netWorthIncludeResp` boolean is saved in the user's existing database preferences
JSON, with the same saving/error/retry behavior as other preferences; no migration
is needed. The tracked account named `RESP` (case-insensitive, trimmed) stays in
the balances table with an exclusion note when disabled, but contributes neither
to net worth nor allocation. Enabling the option includes its balance in both.
Tracked-account selections still apply, and asset valuations are unaffected.
Toggling Include RESP recalculates totals, allocation, exclusion labels and error
flags from the loaded rows and conversions, without refetching balances, assets
or exchange rates. Only the existing debounced preference save writes to the
database. It works the same way in current and historical views; enabling RESP
with a missing balance or rate exposes that problem until a data retry succeeds.

Readers and writers can choose **Historical** from the Net Worth overflow menu.
Its year, month and day choices are bounded by the earliest and latest available
snapshots for tracked accounts and all assets, queried directly from Supabase.
The panel selects each account balance, asset count and unit price independently
using the latest observation before the following UTC midnight. This includes
the full selected day, carries zeros forward and never uses a later observation.
Accounts without a balance by that day, and assets/liabilities without either
a count or price by that day, are omitted even when inactive holdings are shown.
They do not mark totals incomplete. Assets with only one of count/price available
remain incomplete holdings. Current
tracked accounts, RESP inclusion and inactive-holding visibility still apply;
historical account names and tracked-account preferences are not reconstructed.
The selected date is held in panel state only. Historical mode hides create/update
actions and displays the selected date with **Return to current**.
Changing dates, returning to current, or retrying keeps the existing cards mounted
beneath a loading-spinner dialog. Values and their displayed date update together
when the request completes. A failed request removes the spinner, retains the
previous view, and offers retry; obsolete responses cannot replace newer results.

Historical USD conversion uses BoC `FXUSDCAD` observations within ±3 days of the
selected date, widening to ±7 and ±14 days when no valid rate is present. The
closest observation wins, with the earlier date winning ties; the status bar
shows its actual date. A missing rate keeps native values visible and suppresses
the CAD total. Only public rates are cached in memory, keyed by selected date
(up to 256 entries). Dates within the last seven days or in the future expire
after one hour; older dates remain cached until eviction or page reload.
Concurrent requests for one date share a fetch; canceled consumers do not
cancel other consumers. Failed requests are not cached. Database snapshots and
date bounds are reloaded, not cached; obsolete panel requests are canceled and
late responses cannot replace the active date. No new RPCs or migrations are
required for this feature.

The computed net worth total has its own card at the top left, with a separate
account balances card directly below it. Displayed account balances, asset values (including unit prices), allocation
amounts, and overall net worth are rounded to whole currency amounts. Stored
values, calculations, and snapshot inputs retain precision; fractional counts
and one-decimal allocation percentages are unchanged.

The Assets table defaults to descending CAD amount; Liabilities defaults to ascending CAD amount (largest debts first). Each table maintains its own sort selection. Every column
heading is a sort button; selecting the active heading reverses its direction.
Account names initially sort ascending; dates and balances initially sort descending.
Missing values sort last in either direction. Sorting is local to the loaded rows.

Table names may wrap and wide tables scroll within their own cards. Card heights
remain based on their full contents, with no fixed row limit or vertical table
clipping. All strings support English and Spanish.

When the panel stacks in one column (640px or narrower), tables use **Date**,
**Name**, and one **Amount** column containing CAD values with a currency symbol.
Dates use localized numeric month/day and a two-digit year; the full UTC date
remains available to assistive technology and in the date tooltip. Liability
icons are hidden, while negative-value colors remain. Native-amount sorting maps
to CAD sorting in this view. The compact layout follows the panel's actual width,
and wider layouts retain both amount columns and full dates.

Cash Flow is a top-level main menu item. `CashFlowPanel` defaults to the current
calendar year, showing January through the current month. Historical years show
all twelve months. The top-right year selector always offers the current year;
previous years come from `finance.cash_flow_years` for the Cash Flow accounts, so
years without transaction data are omitted. Changing Cash Flow accounts resets the
year and closes any drill-down. `finance.cash_flow` supplies zero-filled monthly
arrays, displayed-month averages, and full-calendar-year totals, with separate
CAD/USD tables and Income, Investment, and Expense sections. Zero-activity
categories remain visible; Visa Payment and uncategorized transactions are excluded
from the aggregate. Export CSV downloads the currently displayed report, including
section totals, displayed-month averages, and annual totals. Currency has its own
column; amounts retain their numeric values without display rounding or conversion.
The export uses localized column labels, YYYY-MM month columns, and a UTF-8 BOM.
It uses the loaded report and is disabled while totals refresh after category edits.
Changing the year retains the loaded table and its original month/year metadata
beneath the shared spinner with a dimmed backdrop. The replacement rows and period
appear together when ready. Export and drill-down cells are disabled while a
report request is pending. Background category refreshes do not cover an already
open Cash Flow transaction popup with a second report-level spinner.
The year-selection handler opens an already-mounted loading dialog immediately,
then lets the browser paint before starting report rendering and fetching. Pending
animation frames are canceled when the account workspace closes or the selection
changes again; there is no fixed minimum display time or artificial network delay.

Transactions uses the same dimmed loading spinner whenever a new result set is
requested, including pagination, sorting, filters, and debounced search. Previously
loaded rows remain visible beneath it until the new results replace them. Canceled
or obsolete requests cannot overwrite the active report or transaction query.

Category/month amounts are keyboard-accessible buttons, including zero amounts.
They open a modal `TransactionsPanel` with the category ID, Cash Flow accounts in
the cell's currency, and a half-open UTC month range. Existing database pagination,
sorting and writer categorization remain available. The popup uses the category and
month as its main heading, with an × close button on the right; search
and filter controls are hidden to preserve the cell's fixed scope. Multiselect and
its checkbox column are disabled in this popup; writers can still categorize
individual transactions using their category buttons. Summary cells are not clickable. Closing
the dialog restores focus to the cell. Saving a category reloads the popup query,
so transactions moved to another category disappear, and immediately refreshes the
Cash Flow table, averages, and totals while the popup stays open.
All new interface strings are in the English and Spanish locale files; month names
and amounts use `Intl` formatting.

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
- `trackedAccounts`: transaction account IDs (`null` tracks all; `[]` tracks none).
- `cashFlowAccounts`: independent Cash Flow account IDs (`null` includes all; `[]` includes none).
  The Cash Flow selector in Preferences lists all available accounts, including untracked ones.
  Existing users default to all accounts until they edit this new setting. It uses the existing
  preferences JSON and autosave mechanism; no additional database migration is needed.
- `transactions`: page size, sort column, sort direction, and remembered date-sort direction.

The former guest/user browser keys and legacy `theme`/`language` keys are no
longer read or written. Existing local preferences are not imported; users start
with defaults until they save preferences to the database. Signed-out appearance
choices stay in memory. Supabase's authentication session storage is unchanged.

`Dashboard` owns `useTrackedAccounts(userId)`, passing `trackedAccountIds` to
transaction views and the independent `cashFlowAccountIds` to Cash Flow. Both
selections use the shared account lookup. Transactions are sorted and paginated by the database, initially
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
