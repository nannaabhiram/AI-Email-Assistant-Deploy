import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/providers.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(approvalsProvider).value?.items.where((a) => a.isPending).length ?? 0;
    final unread = ref.watch(notificationsProvider).value?.items.where((n) => !n.read).length ?? 0;
    return Scaffold(
      body: shell,
      floatingActionButton: shell.currentIndex == 0
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/compose'),
              icon: const Icon(Icons.edit_rounded),
              label: const Text('Compose'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) {
          HapticFeedback.selectionClick();
          shell.goBranch(i, initialLocation: i == shell.currentIndex);
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.inbox_outlined), selectedIcon: Icon(Icons.inbox_rounded), label: 'Inbox'),
          NavigationDestination(
            icon: Badge(isLabelVisible: pending > 0, label: Text('$pending'), child: const Icon(Icons.fact_check_outlined)),
            selectedIcon: const Icon(Icons.fact_check_rounded),
            label: 'Approvals',
          ),
          const NavigationDestination(icon: Icon(Icons.task_alt_outlined), selectedIcon: Icon(Icons.task_alt_rounded), label: 'Tasks'),
          NavigationDestination(
            icon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.notifications_outlined)),
            selectedIcon: const Icon(Icons.notifications_rounded),
            label: 'Alerts',
          ),
        ],
      ),
    );
  }
}
