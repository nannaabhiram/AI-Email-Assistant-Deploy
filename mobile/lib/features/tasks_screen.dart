import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/models.dart';
import '../core/providers.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

class TasksScreen extends ConsumerWidget {
  const TasksScreen({super.key});

  Future<void> _set(BuildContext context, WidgetRef ref, TaskItem t, String status) async {
    HapticFeedback.lightImpact();
    try {
      await ref.read(apiProvider).setTaskStatus(t, status);
      ref.invalidate(tasksProvider);
    } catch (e) {
      if (context.mounted) toast(context, errorText(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(tasksProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Tasks')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(tasksProvider.future),
        child: tasks.when(
          skipLoadingOnRefresh: true,
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(e, onRetry: () => ref.invalidate(tasksProvider)),
          data: (page) {
            final items = [...page.items]..sort((a, b) =>
                (a.dueAt ?? DateTime(9999)).compareTo(b.dueAt ?? DateTime(9999)));
            if (items.isEmpty) {
              return const StateView(icon: Icons.task_alt_rounded, title: 'No open tasks', message: 'Tasks found in your mail appear here.');
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final task = items[i];
                final suggested = task.status == 'suggested';
                return Dismissible(
                  key: ValueKey(task.id),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    decoration: BoxDecoration(color: MpColors.low, borderRadius: BorderRadius.circular(18)),
                    child: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                  onDismissed: (_) => _set(context, ref, task, 'dismissed'),
                  child: Card(
                    child: ListTile(
                      contentPadding: const EdgeInsets.fromLTRB(4, 4, 12, 4),
                      leading: Checkbox(
                        shape: const CircleBorder(),
                        value: task.done,
                        onChanged: (_) => _set(context, ref, task, suggested ? 'open' : 'done'),
                      ),
                      title: Text(task.title),
                      subtitle: Wrap(spacing: 6, children: [
                        if (suggested) const Pill('Suggested · tap ✓ to accept', color: MpColors.brand),
                        if (task.dueAt != null)
                          Pill('Due ${friendlyDate(task.dueAt!)}',
                              color: task.overdue ? MpColors.high : MpColors.low, icon: Icons.schedule_rounded),
                      ]),
                      onTap: task.sourceMessageId == null ? null : () => context.push('/emails/${task.sourceMessageId}'),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
