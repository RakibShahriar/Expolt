# Putting Noor Autos on Vercel

The online version runs the same `server.py` as the office version, with the same roles and approval rules. The
differences: Vercel serves the pages, `api/index.py` answers the requests, and the data is kept in a Postgres database,
because Vercel does not keep files.

## Before you start

- **Vercel plan:** the free Hobby plan is for non-commercial use only, so a dealership needs **Pro**. See
  https://vercel.com/pricing for the current price.
- **Database:** you need a Postgres database in **Singapore**, the same region this project runs in (`sin1`). Neon is the
  simplest, because it can be added from inside Vercel. Supabase also works.

## Deploy it

1. **Create the project.** Put this folder in a private GitHub repository and import it at https://vercel.com/new, or
   run `npx vercel` in this folder. Leave the settings as they are; `vercel.json` already sets them.
2. **Add the database.** In the project, open **Storage**, create a Neon database in Singapore and connect it to the
   project. Connect it to **Production only**, so test deployments can never touch real data.
   - Vercel then adds `DATABASE_URL` for you. Check it under **Settings → Environment Variables**.
   - With another provider, add `DATABASE_URL` yourself, using its **pooled** connection address.
3. **Deploy again**, so the project picks up the database: **Deployments → Redeploy**, or `npx vercel --prod`.
4. **Sign in straight away.** Open the address Vercel gives you, choose **An empty system** and create the Managing
   Director's sign-in. Until you do this, **anyone who finds the address could do it instead**, so do it right after
   deploying. The tables are created automatically on the first visit.
5. **Add your staff** as in README.md (People, then Settings → Sign-in and roles). Online, PINs need at least 6 digits.

To use your own address, such as `dms.noorautos.com`, add it under **Settings → Domains**.

## Moving data from the office server (optional)

Do this before step 4, while the online database is still empty. Records, sign-ins and the change log all move across,
and PINs stay the same (people sign in again). Stop the office server first, then on that computer run:

```
py -m pip install -r requirements.txt
set DATABASE_URL=<the database address from Vercel>
py server.py --import-sqlite data\noor-dms.sqlite
```

On a Mac, use `python3` for `py` and `export` for `set`. If the database already has data, the command changes nothing.

For data that is only in a browser, or in a backup file: finish step 4, then use **Settings → Data → Restore from a
backup file**.

## Backups

- The first person to open the system each day saves that day's copy in the database. The last 30 are kept, plus one
  from just before anyone restores or starts over. Find them under **Settings → Data → Copies saved online**.
- These copies are in the same database as the data, so they do not protect against losing the database. Now and then,
  use **Settings → Data → Download backup** and keep the file somewhere else.

## What it costs

Each open browser tab checks for changes every 5 seconds, and each check is a billed Vercel request and keeps the
database awake. Tabs nobody is looking at stop checking.

One person with the system open for 9 hours makes about 6,500 requests a day, so 10 people working 26 days make about
1.7 million a month. Compare that with the current prices at Vercel and your database provider, and turn on spending
alerts in both.

To check less often, add the setting `NA_POLL_MS` with a value such as `10000` (10 seconds). Changes by other people then
take longer to appear.

## Settings

| Setting | What it does | If not set |
|---|---|---|
| `DATABASE_URL` (or `POSTGRES_URL`) | The database address. **Required.** | The app shows that no database is connected |
| `NA_MIN_PIN` | Shortest PIN allowed, 4 to 8 digits | 6 |
| `NA_POLL_MS` | Milliseconds between checks for changes | 5000 |
| `NA_TZ` | Time zone, in POSIX form | Bangladesh (`<+06>-6`) |

## Limits

- Each request or answer can carry 4.5 MB. Large answers are compressed and large restores go up in parts, so this should
  not affect normal use. Very large data could still reach it: if it does, signing in shows an error.
- Names on the sign-in screen are visible to anyone who opens the address, as in the office version. Only PINs protect the
  data, and five wrong PINs lock a sign-in for five minutes.
- If something goes wrong, look under **Logs** in the Vercel project.

## Updating

Push to GitHub or run `npx vercel --prod`. Your data is in the database, so it is not affected.
