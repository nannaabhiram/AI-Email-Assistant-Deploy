-- MailPilot AI: synthetic seed data for LOCAL DEVELOPMENT ONLY.
-- All people, companies, addresses and messages below are fictional.
-- Login: demo@mailpilot.test / mailpilot-demo-password

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000001',
  'authenticated', 'authenticated', 'demo@mailpilot.test',
  extensions.crypt('mailpilot-demo-password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"demo":true}', '{"full_name":"Demo User"}', now(), now(),
  '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001',
  '{"sub":"00000000-0000-4000-a000-000000000001","email":"demo@mailpilot.test"}', 'email', now(), now(), now()
) on conflict do nothing;

update public.user_settings set timezone = 'Asia/Kolkata' where user_id = '00000000-0000-4000-a000-000000000001';

insert into public.connected_accounts (id, user_id, email_address, status, granted_scopes, last_error)
values (
  '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000001', 'demo@mailpilot.test',
  'needs_reauth', array['https://www.googleapis.com/auth/gmail.readonly'],
  'Synthetic demo account. Connect a real Gmail account to synchronize mail.'
) on conflict do nothing;

insert into public.sync_state (account_id, user_id, status, last_successful_sync_at, messages_synced)
values ('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000001', 'idle', now() - interval '20 minutes', 6)
on conflict do nothing;

insert into public.email_threads (id, user_id, account_id, gmail_thread_id, subject, snippet, message_count, participants, last_message_at) values
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', 'demo-thread-1', 'Q4 vendor contract renewal – signature needed by Friday', 'Please review the attached renewal and sign by Friday 5 PM.', 1, '["priya.nair@northwind.example"]', now() - interval '2 hours'),
  ('00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', 'demo-thread-2', 'Security alert: new sign-in from unrecognized device', 'A new sign-in to your account was detected.', 1, '["no-reply@accounts.example"]', now() - interval '5 hours'),
  ('00000000-0000-4000-a000-000000000103', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', 'demo-thread-3', 'Weekly product digest', 'This week: 5 new features and a webinar.', 1, '["digest@newsletter.example"]', now() - interval '1 day'),
  ('00000000-0000-4000-a000-000000000104', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', 'demo-thread-4', 'URGENT: update payroll bank details today', 'Kindly update the bank account for this month''s payroll.', 1, '["ceo.office@contoso-payroll.example"]', now() - interval '3 hours'),
  ('00000000-0000-4000-a000-000000000105', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', 'demo-thread-5', 'Design review sync on Thursday?', 'Could we meet Thursday 3 PM IST to review the mockups?', 1, '["arjun.mehta@fabrikam.example"]', now() - interval '7 hours'),
  ('00000000-0000-4000-a000-000000000106', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', 'demo-thread-6', 'Quotation for 40 laptops', 'Attached is our quotation of INR 28,40,000 valid for 15 days.', 1, '["sales@adatum.example"]', now() - interval '26 hours')
on conflict do nothing;

insert into public.email_messages (id, user_id, account_id, thread_id, gmail_message_id, gmail_thread_id, rfc822_message_id, from_address, from_name, to_addresses, subject, snippet, body_text, label_ids, is_unread, internal_date, headers, has_attachments, analysis_status) values
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000101', 'demo-msg-1', 'demo-thread-1', '<demo-1@northwind.example>', 'priya.nair@northwind.example', 'Priya Nair', '[{"email":"demo@mailpilot.test","name":"Demo User"}]', 'Q4 vendor contract renewal – signature needed by Friday', 'Please review the attached renewal and sign by Friday 5 PM.',
   E'Hi,\n\nPlease review the attached Q4 renewal for the Northwind support contract and sign it by Friday 5 PM IST. The renewal value is INR 12,50,000 per year.\n\nCould you also confirm whether the SLA change in section 4 is acceptable?\n\nThanks,\nPriya', '{INBOX,UNREAD,IMPORTANT}', true, now() - interval '2 hours', '{}', true, 'done'),
  ('00000000-0000-4000-a000-000000000202', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000102', 'demo-msg-2', 'demo-thread-2', '<demo-2@accounts.example>', 'no-reply@accounts.example', 'Account Security', '[{"email":"demo@mailpilot.test","name":"Demo User"}]', 'Security alert: new sign-in from unrecognized device', 'A new sign-in to your account was detected.',
   E'We detected a new sign-in to your account from an unrecognized Linux device. If this was not you, secure your account immediately from your account settings.', '{INBOX,UNREAD}', true, now() - interval '5 hours', '{}', false, 'done'),
  ('00000000-0000-4000-a000-000000000203', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000103', 'demo-msg-3', 'demo-thread-3', '<demo-3@newsletter.example>', 'digest@newsletter.example', 'Product Digest', '[{"email":"demo@mailpilot.test","name":""}]', 'Weekly product digest', 'This week: 5 new features and a webinar.',
   E'This week: 5 new features, a customer story, and a webinar on Tuesday. Unsubscribe any time.', '{INBOX,CATEGORY_PROMOTIONS}', false, now() - interval '1 day', '{"list-unsubscribe":"<mailto:unsub@newsletter.example>"}', false, 'done'),
  ('00000000-0000-4000-a000-000000000204', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000104', 'demo-msg-4', 'demo-thread-4', '<demo-4@contoso-payroll.example>', 'ceo.office@contoso-payroll.example', 'CEO Office', '[{"email":"demo@mailpilot.test","name":""}]', 'URGENT: update payroll bank details today', 'Kindly update the bank account for this month''s payroll.',
   E'Kindly update the bank account for this month''s payroll to the new account below before 2 PM today. Keep this confidential and do not call. Verify your login here: http://192.0.2.10/login', '{INBOX,UNREAD}', true, now() - interval '3 hours', '{"authentication-results":"spf=fail dkim=none dmarc=fail"}', false, 'done'),
  ('00000000-0000-4000-a000-000000000205', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000105', 'demo-msg-5', 'demo-thread-5', '<demo-5@fabrikam.example>', 'arjun.mehta@fabrikam.example', 'Arjun Mehta', '[{"email":"demo@mailpilot.test","name":""}]', 'Design review sync on Thursday?', 'Could we meet Thursday 3 PM IST to review the mockups?',
   E'Hi, could we meet Thursday at 3 PM IST on Google Meet to review the new dashboard mockups? Agenda: navigation, empty states, and accessibility fixes. Please confirm.', '{INBOX}', false, now() - interval '7 hours', '{}', false, 'done'),
  ('00000000-0000-4000-a000-000000000206', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000106', 'demo-msg-6', 'demo-thread-6', '<demo-6@adatum.example>', 'sales@adatum.example', 'Adatum Sales', '[{"email":"demo@mailpilot.test","name":""}]', 'Quotation for 40 laptops', 'Attached is our quotation of INR 28,40,000 valid for 15 days.',
   E'Dear customer,\n\nAttached is our quotation Q-2026-118 for 40 laptops totalling INR 28,40,000 including GST. The quotation is valid for 15 days.\n\nRegards,\nAdatum Sales', '{INBOX}', false, now() - interval '26 hours', '{}', true, 'done')
on conflict do nothing;

insert into public.email_analysis (user_id, message_id, source, model, priority, priority_score, rule_score, components, summary, explanation, confidence, needs_review, reply_needed, action_required, suggested_action, deadline_at, deadline_timezone, deadline_text, deadline_type, category, is_newsletter, risk_level, risk_flags, escalation_reason) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000201', 'rules', null, 'HIGH', 82, 82, '{"deadline":85,"action":90,"impact":75,"sender":60,"context":50}', 'Northwind asks you to sign the Q4 contract renewal (INR 12,50,000/yr) by Friday 5 PM IST and confirm the SLA change.', 'Explicit signature deadline this week and a direct request for confirmation.', 0.80, false, true, true, 'Review section 4 SLA change and sign the renewal.', date_trunc('day', now()) + interval '3 days 11 hours 30 minutes', 'Asia/Kolkata', 'Friday 5 PM IST', 'explicit', 'work', false, 'none', '[]', null),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000202', 'rules', null, 'HIGH', 58, 58, '{"deadline":20,"action":70,"impact":80,"sender":40,"context":30}', 'Security notice about a new sign-in from an unrecognized Linux device.', 'Security alerts are escalated to HIGH regardless of numeric score.', 0.70, false, false, true, 'Confirm whether the sign-in was yours using your account settings (not links in the email).', null, null, null, 'none', 'security', false, 'low', '[]', 'security_alert'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000203', 'rules', null, 'LOW', 12, 12, '{"deadline":0,"action":0,"impact":10,"sender":20,"context":10}', 'Weekly product newsletter with feature updates and a webinar invitation.', 'Bulk newsletter with List-Unsubscribe header; no action requested.', 0.90, false, false, false, 'Read later or include in newsletter digest.', null, null, null, 'none', 'newsletter', true, 'none', '[]', null),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000204', 'rules', null, 'HIGH', 64, 64, '{"deadline":80,"action":80,"impact":70,"sender":20,"context":30}', 'Request to change payroll bank details urgently; shows multiple phishing indicators.', 'Possible fraud: payment-instruction change, urgency, secrecy, failed SPF/DMARC and an IP-address login link.', 0.60, true, false, true, 'Do not act on this email. Verify through a known phone number and report to your security team.', null, null, null, 'none', 'security', false, 'high', '[{"code":"payment_instruction_change","detail":"Requests changing bank details for payroll"},{"code":"auth_failure","detail":"SPF and DMARC failed"},{"code":"ip_address_url","detail":"Link points to a raw IP address"},{"code":"credential_request","detail":"Asks you to verify your login"},{"code":"urgency_pressure","detail":"Urgent deadline and secrecy request"}]', 'phishing_risk'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000205', 'rules', null, 'MEDIUM', 52, 52, '{"deadline":55,"action":60,"impact":45,"sender":50,"context":40}', 'Arjun proposes a design review on Thursday 3 PM IST via Google Meet and asks for confirmation.', 'Meeting request requiring a reply within the week.', 0.75, false, true, true, 'Confirm or propose another time.', null, null, 'Thursday 3 PM IST', 'none', 'meeting', false, 'none', '[]', null),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000206', 'rules', null, 'MEDIUM', 45, 45, '{"deadline":35,"action":40,"impact":55,"sender":30,"context":30}', 'Adatum quotation Q-2026-118 for 40 laptops: INR 28,40,000 incl. GST, valid 15 days.', 'Commercial quotation with a validity window; decision needed but no explicit request.', 0.70, false, false, true, 'Compare with other quotations before validity ends.', now() + interval '14 days', 'Asia/Kolkata', 'valid for 15 days', 'inferred', 'finance', false, 'none', '[]', null)
on conflict do nothing;

insert into public.tasks (user_id, source_message_id, source_thread_id, title, due_at, due_date_type, due_timezone, evidence, status, needs_confirmation, confidence, created_by) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000101', 'Sign Northwind Q4 contract renewal', date_trunc('day', now()) + interval '3 days 11 hours 30 minutes', 'explicit', 'Asia/Kolkata', 'sign it by Friday 5 PM IST', 'open', false, 0.85, 'rules'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000101', 'Confirm SLA change in section 4', null, 'none', null, 'confirm whether the SLA change in section 4 is acceptable', 'suggested', true, 0.60, 'rules'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000206', '00000000-0000-4000-a000-000000000106', 'Decide on Adatum laptop quotation', now() + interval '14 days', 'inferred', 'Asia/Kolkata', 'The quotation is valid for 15 days.', 'suggested', true, 0.55, 'rules')
on conflict do nothing;

insert into public.commitments (user_id, source_message_id, direction, counterparty, description, due_at, due_date_type, evidence, status, needs_confirmation, confidence, created_by) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000205', 'to_me', 'arjun.mehta@fabrikam.example', 'Arjun to present new dashboard mockups at design review', null, 'none', 'review the new dashboard mockups', 'open', true, 0.50, 'rules')
on conflict do nothing;

insert into public.meetings (user_id, message_id, title, timezone, location, conference_url, participants, agenda, requested_response, source) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000205', 'Design review sync', 'Asia/Kolkata', 'Google Meet', null, '["arjun.mehta@fabrikam.example"]', 'Navigation, empty states, accessibility fixes', 'Confirm attendance', 'rules')
on conflict do nothing;

insert into public.contacts (user_id, email, display_name, domain, is_vip, importance, inbound_count, last_inbound_at) values
  ('00000000-0000-4000-a000-000000000001', 'priya.nair@northwind.example', 'Priya Nair', 'northwind.example', true, 85, 14, now() - interval '2 hours'),
  ('00000000-0000-4000-a000-000000000001', 'arjun.mehta@fabrikam.example', 'Arjun Mehta', 'fabrikam.example', false, 60, 6, now() - interval '7 hours'),
  ('00000000-0000-4000-a000-000000000001', 'sales@adatum.example', 'Adatum Sales', 'adatum.example', false, 35, 2, now() - interval '26 hours'),
  ('00000000-0000-4000-a000-000000000001', 'digest@newsletter.example', 'Product Digest', 'newsletter.example', false, 10, 30, now() - interval '1 day')
on conflict do nothing;

insert into public.search_documents (user_id, message_id, title, content)
select m.user_id, m.id, coalesce(m.subject, ''), coalesce(m.from_name, '') || ' ' || coalesce(m.from_address, '') || E'\n' || coalesce(m.body_text, '')
  from public.email_messages m
 where m.user_id = '00000000-0000-4000-a000-000000000001'
on conflict do nothing;
