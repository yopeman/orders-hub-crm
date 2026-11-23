# Orders Hub CRM

Single-page Next.js 15 + Mongoose CRM that tracks each prospect through the Orders Hub customer life cycle.

## Run

```bash
npm install
cp .env.example .env.local   # set MONGODB_URI (local MongoDB or Atlas)
npm run dev                  # http://localhost:3000
```

## What it does

- Pipeline stages from your flowchart (prospect found → greeting → social media check → order problem → demo → registration → business created → 5 products → link shared → first order → loyal → advocate), plus Transferred to partner and Dropped.
- Each lead has a last contact date, next action and follow-up date.
- Changing a stage fills in the suggested next action from the flowchart.
- "Log contact" sets the last contact date to today, adds a note to the activity history and suggests a follow-up in 3 days.
- Overdue and due-today counters, stage chips, search and follow-up filters.
- Light, dark and system themes (saved in the browser).

## Brand colors

Edit `--brand` and `--cream` at the top of `app/globals.css`. The current values are estimated from your swatch.

## Files

- `app/page.tsx` the whole UI
- `app/api/leads` REST routes (GET, POST, PATCH, DELETE)
- `models/Lead.ts` Mongoose schema
- `lib/stages.ts` stages and suggested next actions
