import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app.dart' show appRouteFor;
import '../core/models.dart';
import '../core/providers.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

class AlertsScreen extends ConsumerWidget {
  const AlertsScreen({super.key});

  IconData _icon(AppNotification n) => switch (n.kind) {
        'important' => Icons.workspace_premium_rounded,
        'reminder' => Icons.alarm_rounded,
        'briefing' => Icons.wb_sunny_rounded,
        'approval' => Icons.fact_check_rounded,
        _ => Icons.notifications_rounded,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Alerts'), actions: [
        TextButton(
          onPressed: () async {
            await ref.read(apiProvider).readAllNotifications();
            ref.invalidate(notificationsProvider);
          },
          child: const Text('Mark all read'),
        ),
      ]),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(notificationsProvider.future),
        child: alerts.when(
          skipLoadingOnRefresh: true,
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(e, onRetry: () => ref.invalidate(notificationsProvider)),
          data: (page) => page.items.isEmpty
              ? const StateView(icon: Icons.notifications_none_rounded, title: 'No alerts yet')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                  itemCount: page.items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final n = page.items[i];
                    final color = n.important ? MpColors.career : Theme.of(context).colorScheme.primary;
                    return Card(
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: color.withValues(alpha: 0.12),
                          child: Icon(_icon(n), color: color),
                        ),
                        title: Text(n.title, style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.w700)),
                        subtitle: Text([if (n.body != null) n.body!, friendlyDate(n.createdAt)].join(' · ')),
                        onTap: () {
                          if (!n.read) {
                            ref.read(apiProvider).readNotification(n.id).then((_) => ref.invalidate(notificationsProvider));
                          }
                          if (n.link != null) context.push(appRouteFor(n.link!));
                        },
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}
