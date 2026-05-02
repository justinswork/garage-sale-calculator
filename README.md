# Garage Sale Calculator

A multi-host garage sale transaction tracker. One person creates an event, shares the link with co-hosts, and everyone logs sales together. The app calculates per-host totals, supports negotiated/discounted totals, tracks per-day breakdowns, and works offline.

## Stack

- React 18 + Vite
- Tailwind CSS
- Firebase (anonymous Auth + Firestore with offline persistence)
- React Router 6
- vite-plugin-pwa
- lucide-react

## How it works

- **Anonymous auth.** No sign-in screen. Each device silently gets a Firebase uid behind the scenes.
- **Hosts decoupled from devices.** A host is a named person on the event; one host can be linked to multiple devices. On first event open per device, you pick yourself from the host list (or add yourself).
- **Sales** consist of items (name, qty, unit price, owner host). The total can be overridden for a negotiated price; the discount is split either proportionally across hosts or manually, or deferred to a `pending` state that's excluded from totals until resolved.
- **Quick-add items.** Any item entered on a sale becomes a one-tap suggestion for the rest of the event, visible to all hosts.
- **Soft-delete.** Deleted sales stay in Firestore (`deletedAt`) and can be restored from the audit log.
- **Per-day breakdowns.** Sales are grouped by local calendar day for multi-day events.
- **Report + CSV export.** End-of-event report with totals, per-host shares, per-day breakdown, and CSV download.

## Firebase setup

1. Create a Firebase project at https://console.firebase.google.com.
2. **Enable Anonymous auth:** Authentication → Sign-in method → Anonymous → Enable.
3. **Create a Firestore database** in production mode.
4. Register a web app and copy the `firebaseConfig` values.
5. Copy `.env.example` to `.env` and paste the config values.
6. Deploy the security rules:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules
   ```

## Local development

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — local dev server with hot reload
- `npm run build` — production build into `dist/`
- `npm run preview` — preview the production build locally
- `npm run deploy` — bump patch version, build, and deploy to Firebase Hosting

## Firestore data model

```
events/{eventId}                 name, createdAt, createdByUid, status
  hosts/{hostId}                 name, joinedAt, deviceUids[]
  sales/{saleId}                 enteredByHostId, enteredByUid, status (draft|completed|pending-discount),
                                 items[{name,qty,unitPrice,hostId}], itemsSubtotal,
                                 overrideTotal, discountAllocation ('proportional'|{hostId:cents}|null),
                                 notes, createdAt, completedAt, deletedAt, deletedBy
  quickAddItems/{itemId}         name, defaultPrice, defaultHostId, lastUsedAt
```

All money amounts are stored as integer cents.
