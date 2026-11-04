import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models.dart';
import '../core/providers.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

class ApprovalsScreen extends ConsumerWidget {
  const ApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final approvals = ref.watch(approvalsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Approvals')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(approvalsProvider.future),
        child: approvals.when(
          skipLoadingOnRefresh: true,
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(e, onRetry: () => ref.invalidate(approvalsProvider)),
          data: (page) => page.items.isEmpty
              ? const StateView(
                  icon: Icons.verified_rounded,
                  title: 'Nothing waiting',
                  message: 'Replies and inbox actions that need your OK show up here.')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                  itemCount: page.items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => _ApprovalCard(page.items[i]),
                ),
        ),
      ),
    );
  }
}

class _ApprovalCard extends ConsumerStatefulWidget {
  const _ApprovalCard(this.a);
  final Approval a;

  @override
  ConsumerState<_ApprovalCard> createState() => _ApprovalCardState();
}

class _ApprovalCardState extends ConsumerState<_ApprovalCard> {
  bool _busy = false;

  Future<void> _act(bool approve) async {
    HapticFeedback.mediumImpact();
    setState(() => _busy = true);
    try {
      final api = ref.read(apiProvider);
      approve ? await api.approve(widget.a) : await api.reject(widget.a.id);
      ref.invalidate(approvalsProvider);
      if (mounted) toast(context, approve ? 'Approved' : 'Rejected');
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    final t = Theme.of(context);
    final stateColor = switch (a.state) {
      'FAILED' => MpColors.high,
      'APPROVED' || 'EXECUTING' => MpColors.brand,
      _ => MpColors.medium,
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(a.title, style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
            Pill(a.state.replaceAll('_', ' ').toLowerCase(), color: stateColor),
          ]),
          if (a.to.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('To ${a.to.join(', ')}', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline)),
          ],
          if (a.body.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(a.body, maxLines: 6, overflow: TextOverflow.ellipsis, style: t.textTheme.bodyMedium),
          ] else if (a.explanation.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(a.explanation, style: t.textTheme.bodyMedium),
          ],
          if (a.error != null) ...[
            const SizedBox(height: 8),
            Text(a.error!, style: t.textTheme.bodySmall?.copyWith(color: MpColors.high)),
          ],
          if (a.isPending) ...[
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: _busy ? null : () => _act(false), child: const Text('Reject'))),
              const SizedBox(width: 10),
              Expanded(child: FilledButton(onPressed: _busy ? null : () => _act(true), child: const Text('Approve'))),
            ]),
          ],
        ]),
      ),
    );
  }
}
