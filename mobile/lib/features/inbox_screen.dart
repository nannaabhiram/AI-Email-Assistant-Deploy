import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/models.dart';
import '../core/providers.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  static const _labels = {
    InboxFilter.all: 'All',
    InboxFilter.high: 'High priority',
    InboxFilter.career: 'Offers & interviews',
    InboxFilter.unread: 'Unread',
    InboxFilter.reply: 'Needs reply',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(inboxFilterProvider);
    final inbox = ref.watch(inboxProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inbox'),
        actions: [
          IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () => context.push('/settings')),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              children: [
                for (final f in InboxFilter.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(_labels[f]!),
                      selected: f == filter,
                      onSelected: (_) => ref.read(inboxFilterProvider.notifier).set(f),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(inboxProvider.future),
        child: inbox.when(
          skipLoadingOnRefresh: true,
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(e, onRetry: () => ref.invalidate(inboxProvider)),
          data: (page) => page.items.isEmpty
              ? const StateView(icon: Icons.inbox_rounded, title: 'All clear', message: 'No emails match this filter.')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 96),
                  itemCount: page.items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => EmailTile(page.items[i]),
                ),
        ),
      ),
    );
  }
}

class EmailTile extends StatelessWidget {
  const EmailTile(this.email, {super.key});
  final EmailListItem email;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final bold = email.isUnread ? FontWeight.w700 : FontWeight.w500;
    return Card(
      clipBehavior: Clip.antiAlias,
      shape: email.isCareer
          ? RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18), side: const BorderSide(color: MpColors.career, width: 1.5))
          : null,
      child: InkWell(
        onTap: () => context.push('/emails/${email.id}'),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              PriorityDot(email.priority),
              const SizedBox(width: 8),
              Expanded(
                child: Text(email.sender,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: t.textTheme.titleSmall?.copyWith(fontWeight: bold)),
              ),
              if (email.hasAttachments) Icon(Icons.attach_file_rounded, size: 15, color: t.colorScheme.outline),
              const SizedBox(width: 4),
              Text(friendlyDate(email.date), style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.outline)),
            ]),
            const SizedBox(height: 4),
            Text(email.subject ?? '(no subject)',
                maxLines: 1, overflow: TextOverflow.ellipsis, style: t.textTheme.bodyMedium?.copyWith(fontWeight: bold)),
            const SizedBox(height: 2),
            Text(email.summary ?? email.snippet ?? '',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
            if (email.isCareer || email.replyNeeded || email.deadlineAt != null || email.isRisky || email.isVip) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 4, children: [
                if (email.isCareer) const Pill('Career', color: MpColors.career, icon: Icons.work_rounded),
                if (email.isVip) const Pill('VIP', color: MpColors.brand, icon: Icons.star_rounded),
                if (email.replyNeeded) const Pill('Reply needed', color: MpColors.medium),
                if (email.deadlineAt != null)
                  Pill('Due ${friendlyDate(email.deadlineAt!)}', color: MpColors.high, icon: Icons.schedule_rounded),
                if (email.isRisky) const Pill('Suspicious', color: MpColors.high, icon: Icons.gpp_maybe_rounded),
              ]),
            ],
          ]),
        ),
      ),
    );
  }
}
