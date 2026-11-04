import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../core/api.dart';
import '../core/models.dart';
import '../core/providers.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

class EmailScreen extends ConsumerWidget {
  const EmailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final email = ref.watch(emailProvider(id));
    return Scaffold(
      appBar: AppBar(
        title: const SizedBox.shrink(),
        actions: [
          if (email.value != null)
            PopupMenuButton<Priority?>(
              tooltip: 'Set priority',
              icon: const Icon(Icons.flag_outlined),
              onSelected: (p) async {
                await ref.read(apiProvider).setPriority(id, p);
                ref.invalidate(emailProvider(id));
                ref.invalidate(inboxProvider);
              },
              itemBuilder: (_) => [
                for (final p in Priority.values) PopupMenuItem(value: p, child: Text('Mark ${p.name}')),
                const PopupMenuItem(value: null, child: Text('Use AI priority')),
              ],
            ),
        ],
      ),
      body: email.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(e, onRetry: () => ref.invalidate(emailProvider(id))),
        data: (m) => _EmailBody(m),
      ),
      bottomNavigationBar: email.value == null
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: FilledButton.icon(
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  showDragHandle: true,
                  builder: (_) => ReplySheet(email: email.value!),
                ),
                icon: const Icon(Icons.auto_awesome_rounded),
                label: const Text('Reply with AI'),
              ),
            ),
    );
  }
}

class _EmailBody extends StatelessWidget {
  const _EmailBody(this.m);
  final EmailDetail m;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final a = m.analysis;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
      Text(m.subject ?? '(no subject)', style: t.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
      const SizedBox(height: 10),
      Row(children: [
        CircleAvatar(
          radius: 18,
          child: Text((m.fromName ?? m.fromAddress ?? '?').characters.first.toUpperCase()),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(m.sender, style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
            Text(DateFormat.yMMMd().add_jm().format(m.date),
                style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.outline)),
          ]),
        ),
      ]),
      if (a != null) ...[
        const SizedBox(height: 16),
        Card(
          color: a.category == 'career' ? MpColors.career.withValues(alpha: 0.10) : t.colorScheme.primaryContainer.withValues(alpha: 0.45),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                PriorityDot(a.priority),
                const SizedBox(width: 6),
                Text('${a.priority?.name.toUpperCase() ?? 'UNSCORED'}${a.score != null ? ' · ${a.score}' : ''}',
                    style: t.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700)),
                const Spacer(),
                if (a.category == 'career') const Pill('Career', color: MpColors.career, icon: Icons.work_rounded),
              ]),
              if (a.summary.isNotEmpty) ...[const SizedBox(height: 8), Text(a.summary)],
              if (a.suggestedAction != null) ...[
                const SizedBox(height: 8),
                Text('Next: ${a.suggestedAction}', style: t.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
              ],
              if (a.deadlineAt != null || a.deadlineText != null) ...[
                const SizedBox(height: 6),
                Text('Deadline: ${a.deadlineAt != null ? DateFormat.yMMMd().add_jm().format(a.deadlineAt!) : a.deadlineText}',
                    style: t.textTheme.bodySmall?.copyWith(color: MpColors.high, fontWeight: FontWeight.w600)),
              ],
              for (final f in a.riskFlags)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(children: [
                    const Icon(Icons.gpp_maybe_rounded, size: 16, color: MpColors.high),
                    const SizedBox(width: 6),
                    Expanded(child: Text(f, style: t.textTheme.bodySmall)),
                  ]),
                ),
            ]),
          ),
        ),
      ],
      const SizedBox(height: 18),
      SelectableText(m.bodyText?.trim().isNotEmpty == true ? m.bodyText!.trim() : '(This email has no text content.)',
          style: t.textTheme.bodyLarge?.copyWith(height: 1.45)),
      if (m.attachments.isNotEmpty) ...[
        const SizedBox(height: 18),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final f in m.attachments) Chip(avatar: const Icon(Icons.attach_file_rounded, size: 16), label: Text(f)),
        ]),
      ],
    ]);
  }
}

/// Generates an AI reply draft, lets the user edit it, then sends it through the approval engine.
class ReplySheet extends ConsumerStatefulWidget {
  const ReplySheet({super.key, required this.email});
  final EmailDetail email;

  @override
  ConsumerState<ReplySheet> createState() => _ReplySheetState();
}

class _ReplySheetState extends ConsumerState<ReplySheet> {
  final _instructions = TextEditingController();
  final _subject = TextEditingController();
  final _body = TextEditingController();
  String _tone = 'professional';
  Draft? _draft;
  bool _busy = false;

  @override
  void dispose() {
    _instructions.dispose();
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => _busy = true);
    try {
      await fn();
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _generate() => _run(() async {
        final d = await ref.read(apiProvider).createReplyDraft(widget.email.id,
            tone: _tone, instructions: _instructions.text.trim().isEmpty ? null : _instructions.text.trim());
        _subject.text = d.subject;
        _body.text = d.body;
        setState(() => _draft = d);
      });

  Future<void> _send() => _run(() async {
        final api = ref.read(apiProvider);
        final d = await api.updateDraft(_draft!, subject: _subject.text, body: _body.text);
        Approval approval;
        try {
          approval = await api.requestApproval(d.id);
        } on ApiException catch (e) {
          if (e.code != 'external_recipients_unconfirmed' || !mounted) rethrow;
          final ok = await _confirmExternal(e.details['external_recipients']);
          if (!ok) return;
          approval = await api.requestApproval(d.id, acknowledgeExternal: true);
        }
        await api.approve(approval);
        ref.invalidate(approvalsProvider);
        if (!mounted) return;
        Navigator.of(context).pop();
        toast(context, 'Reply approved and sending');
      });

  Future<bool> _confirmExternal(Object? recipients) async =>
      await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('New recipients'),
          content: Text('These people are not in the conversation:\n${(recipients as List?)?.join('\n') ?? ''}'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Send anyway')),
          ],
        ),
      ) ??
      false;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Text(_draft == null ? 'Reply with AI' : 'Review reply', style: t.textTheme.titleLarge),
          const SizedBox(height: 12),
          if (_draft == null) ...[
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'professional', label: Text('Professional')),
                ButtonSegment(value: 'friendly', label: Text('Friendly')),
                ButtonSegment(value: 'concise', label: Text('Concise')),
              ],
              selected: {_tone},
              onSelectionChanged: (s) => setState(() => _tone = s.first),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _instructions,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'Optional: e.g. "Accept the offer and ask about the joining date"'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _generate,
              child: _busy ? const _Spinner() : const Text('Generate draft'),
            ),
          ] else ...[
            Text('To: ${_draft!.to.join(', ')}', style: t.textTheme.bodySmall),
            const SizedBox(height: 8),
            TextField(controller: _subject, decoration: const InputDecoration(labelText: 'Subject')),
            const SizedBox(height: 8),
            TextField(controller: _body, minLines: 8, maxLines: 16, decoration: const InputDecoration(labelText: 'Message')),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy ? null : () => setState(() => _draft = null),
                  child: const Text('Regenerate'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FilledButton.icon(
                  onPressed: _busy ? null : _send,
                  icon: const Icon(Icons.send_rounded),
                  label: _busy ? const _Spinner() : const Text('Approve & send'),
                ),
              ),
            ]),
          ],
        ]),
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();
  @override
  Widget build(BuildContext context) =>
      const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white));
}

