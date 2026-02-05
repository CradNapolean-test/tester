# classcast monorepo

`classcast` contains:
- `apps/coach` (Expo React Native, TypeScript)
- `apps/display` (Next.js App Router, TypeScript)
- `supabase/schema.sql` (database schema)

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the SQL from `supabase/schema.sql`.
4. In Supabase Dashboard, enable **Realtime** replication for the `sessions` table:
   - Database → Replication (or Realtime settings)
   - Add/enable `public.sessions` for realtime updates

## Environment setup

Create the following files:

- `apps/coach/.env`
- `apps/display/.env.local`

Use these values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Run commands

### Coach (Expo)

```bash
cd apps/coach
npm install
npx expo start
```

### Display (Next.js)

```bash
cd apps/display
npm install
npm run dev -- -H 0.0.0.0 -p 3000
```

Open the display at: <http://localhost:3000>

## How to test end-to-end

1. In **Coach**, create a workout (at least one interval block with exercises).
2. Start a session from that workout.
3. Note the 4-character display code shown in coach.
4. In **Display**, open `/`, enter the code, and join.
5. In **Coach**, start the timer and confirm the display timer/phase updates.
6. Use **Live Edit** in coach:
   - change block name / interval values / exercise fields
   - save and verify display updates from realtime session state
7. Verify **Clear Live Edits** returns display content to base workout blocks.
8. Verify **exercise cycling per round**:
   - current exercise uses `(round - 1) % exerciseCount`
   - next-up exercise uses `round % exerciseCount`
   - coach and display should stay in sync each round.
