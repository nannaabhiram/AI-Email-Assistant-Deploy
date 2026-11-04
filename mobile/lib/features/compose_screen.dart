import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models.dart';
import '../core/providers.dart';
import '../ui/widgets.dart';

final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

class ComposeScreen extends ConsumerStatefulWidget {
  const ComposeScreen({super.key, this.prefillTo});
  final String? prefillTo;

  @override
  ConsumerState<ComposeScreen> createState() => _ComposeScreenState();
}

class _ComposeScreenState extends ConsumerState<ComposeScreen> {
  final _to = <String>[];
  final _toInput = TextEditingController();
  final _subject = TextEditingController();
  final _body = TextEditingController();
  List<Recipient> _suggestions = const [];
  Timer? _debounce;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    if (widget.prefillTo != null && _emailRe.hasMatch(widget.prefillTo!)) _to.add(widget.prefillTo!);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _toInput.dispose();
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  void _onToChanged(String v) {
    if (v.endsWith(',') || v.endsWith(' ')) {
      _addRecipient(v.substring(0, v.length - 1));
      return;
    }
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() => _suggestions = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 200), () async {
      try {
        final r = await ref.read(apiProvider).recipients(v.trim());
        if (mounted && _toInput.text == v) setState(() => _suggestions = r.where((s) => !_to.contains(s.email)).toList());
      } catch (_) {}
    });
  }

  void _addRecipient(String raw) {
    final email = raw.trim();
    if (email.isEmpty) return;
    if (!_emailRe.hasMatch(email)) {
      toast(context, '"$email" is not a valid email address');
      return;
    }
    setState(() {
      if (!_to.contains(email)) _to.add(email);
      _toInput.clear();
      _suggestions = const [];
    });
  }

  Future<void> _send() async {
    if (_toInput.text.trim().isNotEmpty) _addRecipient(_toInput.text);
    if (_to.isEmpty) return toast(context, 'Add at least one recipient');
    if (_body.text.trim().isEmpty) return toast(context, 'Write a message first');
    setState(() => _sending = true);
    final api = ref.read(apiProvider);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final draft = (to: List.of(_to), subject: _subject.text, body: _body.text);
    try {
      final result = await api.composeSend(to: draft.to, subject: draft.subject, body: draft.body);
      navigator.pop();
      messenger.showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 9),
        content: const Text('Sending…'),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () async {
            try {
              await api.undoSend(result.approvalId);
              messenger.showSnackBar(const SnackBar(content: Text('Send cancelled'), behavior: SnackBarBehavior.floating));
            } catch (e) {
              messenger.showSnackBar(SnackBar(content: Text(errorText(e)), behavior: SnackBarBehavior.floating));
            }
          },
        ),
      ));
    } catch (e) {
      if (mounted) {
        setState(() => _sending = false);
        toast(context, errorText(e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('New message', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
              onPressed: _sending ? null : _send,
              icon: const Icon(Icons.send_rounded, size: 18),
              label: const Text('Send'),
            ),
          ),
        ],
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final r in _to) InputChip(label: Text(r), onDeleted: () => setState(() => _to.remove(r))),
        ]),
        if (_to.isNotEmpty) const SizedBox(height: 8),
        TextField(
          controller: _toInput,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(hintText: 'To', prefixIcon: Icon(Icons.person_add_alt_rounded)),
          onChanged: _onToChanged,
          onSubmitted: _addRecipient,
        ),
        if (_suggestions.isNotEmpty)
          Card(
            margin: const EdgeInsets.only(top: 6),
            child: Column(children: [
              for (final s in _suggestions)
                ListTile(
                  dense: true,
                  leading: CircleAvatar(radius: 14, child: Text((s.name ?? s.email).characters.first.toUpperCase())),
                  title: Text(s.name ?? s.email),
                  subtitle: s.name == null ? null : Text(s.email),
                  trailing: s.isVip ? Icon(Icons.star_rounded, color: t.colorScheme.primary, size: 18) : null,
                  onTap: () => _addRecipient(s.email),
                ),
            ]),
          ),
        const SizedBox(height: 10),
        TextField(controller: _subject, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: 'Subject')),
        const SizedBox(height: 10),
        TextField(
          controller: _body,
          minLines: 12,
          maxLines: null,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(hintText: 'Message'),
        ),
      ]),
    );
  }
}
