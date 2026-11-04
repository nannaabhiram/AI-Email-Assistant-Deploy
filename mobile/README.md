# MailPilot mobile (Flutter, Android + iOS)

Native app on the existing FastAPI backend and Supabase Google sign-in. Screens: Inbox (filters: All,
High priority, Offers & interviews, Unread, Needs reply), email detail with AI summary/deadline/risk and
"Reply with AI" (edit, then approve and send), Compose with recipient autocomplete and 10 s undo,
Approvals, Tasks, Alerts and Settings. Push alerts arrive through Firebase Cloud Messaging; tapping one
opens the email.

## One-time setup (all free)

1. **Supabase redirect**: Dashboard > Authentication > URL Configuration > Redirect URLs, add
   `in.mailpilot.app://login-callback`.
2. **Build config**: copy `env/prod.example.json` to `env/prod.json` and paste the same publishable key the
   web app uses (`VITE_SUPABASE_PUBLISHABLE_KEY`).
3. **Firebase (push)**: console.firebase.google.com > Add project (Spark plan, free).
   - Add an Android app with package `in.mailpilot.app`, download `google-services.json` to
     `android/app/`.
   - Project settings > Service accounts > Generate new private key. Put the whole JSON in the Render
     env var `FCM_SERVICE_ACCOUNT_JSON` on `mailpilot-api` (the worker runs in the same service).
4. **Database**: `npx supabase db push` (applies `20261104000100_push_devices.sql`) before deploying the
   backend.

Without step 3 the app still works; push simply stays off.

## Run / build

```bash
cd mobile
flutter pub get
flutter run --dart-define-from-file=env/prod.json            # phone connected via USB
flutter build apk --release --dart-define-from-file=env/prod.json
```

No Android Studio needed for the APK either: the `Mobile` GitHub Actions workflow builds
`app-release.apk` on every push to `main` (download it from the run's Artifacts). Add repo secrets
`MOBILE_SUPABASE_PUBLISHABLE_KEY` and `MOBILE_GOOGLE_SERVICES_JSON` (file contents) first.

## iOS

The code and `Info.plist` (URL scheme, background push) are ready; building needs a Mac with Xcode
(`flutter build ios`). Add `GoogleService-Info.plist` to `ios/Runner/`, then in Xcode enable the
**Push Notifications** and **Background Modes > Remote notifications** capabilities and upload an APNs key
to Firebase. Apple only allows remote push for apps signed with a paid Apple Developer account
($99/yr); with a free Apple ID the app installs and works, but alerts come only through the free ntfy
channel (see the career-priority setup).

## Notes

- Release builds are signed with the debug key (fine for sideloading). Create an upload keystore before
  publishing to Play.
- Render free instances cold-start in about 50 s; the client waits 75 s before showing "server is waking up".
