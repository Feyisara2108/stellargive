# feat: Debounced campaign search bar with URL state sync

## Summary

Adds a fast, shareable search experience to the campaign grid on the home page
(`CampaignList`). Users can filter campaigns as they type, share or bookmark a
search via a `?q=` URL param, and clear the query with an inline button.

Closes #196.

## What changed

- **Debounced filtering** — search input filters the grid by `title`, `category`,
  `creator`, and `beneficiary` (case-insensitive). Filtering is debounced by
  ~300ms via a new reusable `useDebouncedValue` hook so we don't re-filter on
  every keystroke.
  > Note: issue #196 asks to filter by `title` and `description`, but the
  > `Campaign` model has no `description` field. `category` is the descriptive
  > text field on the model, so it stands in for `description`; existing
  > `creator`/`beneficiary` matching is preserved.
- **Inline clear (x) button** — an `X` icon button appears inside the input when
  a query is present and resets the search (labelled "Clear search").
- **Shareable URL state** — the debounced query is synced into a `?q=` URL param
  with `router.replace` (no history spam), and the input initializes from `?q=`
  on load, so searches survive a reload and are shareable.
- **Empty state** — when a query matches nothing, the grid shows
  "No campaigns match your search" with a hint and clear/create actions.
- **Suspense boundary** — `CampaignList` now wraps its content in `<Suspense>`
  because `useSearchParams` otherwise forces the whole route into client-side
  rendering in the Next 14 App Router. Mirrors the existing pattern in
  `src/app/explore/page.tsx`.

## Files

- `frontend/src/hooks/useDebouncedValue.ts` — new generic debounce hook.
- `frontend/src/components/CampaignList.tsx` — search wiring, URL sync, clear
  button, empty-state copy, Suspense boundary.
- `frontend/src/components/CampaignList.test.tsx` — navigation mock plus tests
  for typing/filtering, `?q=` sync, init-from-URL, and the inline clear button.

## Test plan

- [x] `npx vitest run src/components/CampaignList.test.tsx` — 7/7 pass
- [x] Full suite: 60 tests pass (`soroban.test.ts` failure is pre-existing and
      unrelated — an `rpc.Server` mock issue on the clean tree)
- [x] `npx tsc --noEmit` — clean
- [x] `npx next lint` on changed files — no warnings or errors
- [ ] Manual: typing filters the grid; the `x` button resets it; the URL
      reflects `?q=`; reloading preserves the query; empty state renders
