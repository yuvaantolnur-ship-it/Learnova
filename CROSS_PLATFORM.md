# Scorelytics cross-platform setup

The source now has a hosted API foundation, an Electron desktop shell, and a
Capacitor mobile shell. The Supabase project and Render service still need to
be created and configured before these apps can sign in or sync data. Do not
import real user records until the database migration and account isolation
have been tested with an adult.

## Hosted service

1. An adult creates a Supabase project and applies all SQL migrations in
   `supabase/migrations/` in timestamp order.
2. Create a Render web service from this repository using `render.yaml`.
   Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Render from the Supabase
   project settings. The OpenAI key is optional; an adult should configure it
   only after reviewing provider terms, privacy, and potential charges.
3. Keep provider keys in Render's secret environment variables. Never put a
   Supabase service-role key or an OpenAI key in the app, repository, or a
   mobile build.
4. Wait for deployment, then verify the service's `/api/health` endpoint
   returns `{"status":"ok"}`. The configured service name defaults to
   `scorelytics-api.onrender.com`; if Render assigns a different domain, use
   that domain in the commands below.
5. Before real data is imported, verify that two test accounts cannot read or
   change one another's records. The old local `users.json` is not changed by
   deployment or by the hosted service.

Hosted accounts use an email and password. Legacy usernames and passwords are
not uploaded: the import page transfers only the selected account's test
results and saved location. Each person should use their own recoverable
account with adult help.

Hosted StudyBot chats are saved to the signed-in account and can be continued
on another device. Each account can keep up to 50 chats, and each chat is
limited to 200 messages; users can delete chats from the StudyBot screen.
Chat messages and recent test results are sent to the configured AI provider
to generate replies. Deleting a chat removes the Scorelytics copy, but cannot
delete information already processed or retained by that provider. An adult
should review the provider's privacy terms before enabling cloud AI.

## Windows and macOS desktop

Install Node.js 22 or later and run `npm ci`. Set the public hosted API URL in
the terminal before starting or building. The desktop preparation command
stores only this public service URL in a generated config file included in the
desktop package:

```powershell
$env:SCORELYTICS_PUBLIC_API_URL = "https://scorelytics-api.onrender.com"
npm run start:desktop
```

Build an installer on the matching operating system:

```powershell
npm run build:desktop:windows
npm run build:desktop:mac
```

Windows installers are built on Windows. macOS packages require macOS and
Xcode tooling. Change the URL above if the Render service has a different
domain. The existing `npm start` command remains the local Express server.

## Android and iOS

Set the hosted API URL, then prepare the mobile-only frontend. This generated
bundle contains an allowlist of browser assets, not the local database or
backend source:

```powershell
$env:SCORELYTICS_PUBLIC_API_URL = "https://scorelytics-api.onrender.com"
npm run cap:prepare
npx cap add android
npm run cap:sync
npm run cap:open-android
```

For iOS, run the equivalent commands on a Mac with Xcode installed, substituting
`ios` for `android`. Android builds require Android Studio and a supported JDK.
The mobile camera flow and PDF saving must still be validated on real devices
before release; packaging the shells alone does not certify those features.
