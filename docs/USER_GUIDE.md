# User guide

1. **Sign in or create an account.** On the login page you can also sign in with an emailed magic link.
2. **Connect Gmail** (Onboarding, or Security & accounts → Connect account). MailPilot asks only for read access. The first sync runs in the background, covering the last 30 days by default (adjustable in Preferences).
3. **Dashboard**: priority counts, unread and action-required counts, today's deadlines, overdue items, important mail, pending approvals, last sync, and DGX inference health. Banners warn when you are offline, data is stale, the DGX is down, or an account needs reconnecting.
4. **Priority inbox**: filter by priority, unread, action required, needs reply, needs review, suspicious or newsletters, and sort by priority, date or deadline. Select emails to *propose* archive, mark-read or label changes. These go to Approvals.
5. **Email detail**: the message as safe plain text, why it got its priority (score breakdown, confidence, explanation), security warnings, extracted tasks with their source quotes, detected meetings, the conversation with a thread summary (facts kept separate from inferences), and attachment analysis. You can correct the priority, and your correction is recorded as feedback.
6. **Draft a reply**: choose a tone (professional, friendly, formal, concise or custom) and optional instructions. In **Reply drafts** you can edit, regenerate, and compare versions word by word. Then **Request send approval**.
7. **Approvals**: review the exact sender, recipients, subject and body, tick the confirmation box, and approve. Rejecting, cancelling, and retrying failed actions (without duplicate sends) are all here. Any edit to a draft cancels its approval.
8. **Tasks & commitments**: confirm or dismiss suggested items, complete tasks, and add your own. Inferred dates are labelled, and reminders appear in notifications.
9. **Search**: plain language, for example "emails that require a response today", "the last quotation someone sent me", or "which commitments have I not completed?". The interpreted filters are shown.
10. **Daily briefings**: generated at your chosen time, or on demand.
11. **Attachments**: analyse PDFs, text, CSV and Word files for amounts, invoice numbers, deadlines and inconsistencies. Dangerous file types are blocked.
12. **Organize & digests**: newsletter digest, exact duplicates, and suggested labels and archives. Each suggestion becomes an approval request.
13. **Contacts & VIPs**: VIP status, importance, minimum and maximum priority, mute, preferred reply tone, and relationship memory (deletable).
14. **Analytics**: volume, priority distribution, reply backlog and median response time, overdue tasks, overrides, and AI latency and failure rates.
15. **Security & accounts**: grant send or modify permissions only when needed, sync, full resync, disconnect (optionally deleting data), DGX diagnostics, background jobs, audit log, and account deletion.
16. **Preferences**: timezone, briefing time, notifications, scoring thresholds and weights, the review-confidence threshold, auto-analysis, attachment handling, sync window, retention, and deleting synced data.

## Compose and send

- Press **Compose** (sidebar on desktop, the pencil button on phones) or the **c** key. The window floats bottom-right on desktop, can be minimized or made full screen, and is a full-screen sheet on phones.
- Type part of a name or address in To, Cc or Bcc (e.g. `nanna.ab`). Suggestions come from people you have emailed or who emailed you, ranked by how well they match, how often you write to them and how recently. Small typos still match. Use ↑/↓ and Enter or Tab to pick; paste a list of addresses to add them all.
- **Send** (or Ctrl/Cmd + Enter) sends from your connected Gmail after a 10-second undo window. Press **Undo** in that window to reopen the message unsent. Sent mail is recorded under Approvals for audit; it does not wait for approval because you sent it yourself.
- Closing the window keeps the draft on this device; Compose reopens it. The trash icon discards it.
- Sending needs the Gmail send permission. If it is missing, the window offers **Grant permission** and keeps your message.

## Telegram mail assistant

Once your own bot is connected (Preferences → Phone alerts), chat with it in plain words:

- "show me the mail from Infosys" / "any mail about my offer letter?" — finds the mail and explains it
  (sender, date, what it is about, what to do, the mail text). Tap **Reply** to answer it.
- "send mail to rahul@gmail.com saying i will come tomorrow 10am" — MailPilot rewrites your words into a
  professional email and shows a preview with **Approve & send**, **Rewrite**, **Change…** and **Delete**.
  Nothing is sent until you approve, and **Undo** works for 10 seconds after.

Only internship/job offers, selections and interview calls are pushed to Telegram on their own.

## Convert to professional (website)

In Compose, type the message in your own words and press **Convert to professional**. Review the
polished version, then **Use this**, **Try another** or **Keep mine**. The undo arrow restores your text.

## Automatic sync

New mail syncs every minute without pressing anything, and the site pops up "New message from …".
On Render the worker pings the service's own URL (RENDER_EXTERNAL_URL) every 10 minutes so the free
instance does not fall asleep. **Sync now** / **Full resync** remain for manual use.
