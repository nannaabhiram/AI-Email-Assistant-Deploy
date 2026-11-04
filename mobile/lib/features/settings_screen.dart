import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart' show pushProvider;
import '../core/config.dart';
import '../core/providers.dart';
import '../core/push.dart';
import '../ui/widgets.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(padding: const EdgeInsets.all(12), children: [
        Card(
          child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person_rounded)),
            title: Text(profile.value?.displayName ?? 'Signed in'),
            subtitle: Text(profile.value?.email ?? Supabase.instance.client.auth.currentUser?.email ?? ''),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.notifications_active_rounded),
              title: const Text('Send a test notification'),
              subtitle: Text(PushService.firebaseAvailable ? 'Checks that alerts reach this phone' : 'Push is not configured in this build'),
              enabled: PushService.firebaseAvailable,
              onTap: () async {
                try {
                  await ref.read(apiProvider).testPush();
                  if (context.mounted) toast(context, 'Sent. It should arrive in a few seconds.');
                } catch (e) {
                  if (context.mounted) toast(context, errorText(e));
                }
              },
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.open_in_browser_rounded),
              title: const Text('Gmail connection, rules & preferences'),
              subtitle: const Text('Opens the MailPilot website'),
              onTap: () => launchUrl(Uri.parse('${AppConfig.webAppUrl}/settings/accounts'), mode: LaunchMode.externalApplication),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: const Icon(Icons.logout_rounded, color: Colors.redAccent),
            title: const Text('Sign out', style: TextStyle(color: Colors.redAccent)),
            onTap: () async {
              await ref.read(pushProvider).stop();
              await Supabase.instance.client.auth.signOut();
            },
          ),
        ),
      ]),
    );
  }
}
