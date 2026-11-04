import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/api.dart';
import '../core/models.dart';
import 'theme.dart';

String friendlyDate(DateTime d) {
  final now = DateTime.now();
  if (d.year == now.year && d.month == now.month && d.day == now.day) return DateFormat.jm().format(d);
  if (now.difference(d).inDays < 7) return DateFormat.E().format(d);
  if (d.year == now.year) return DateFormat.MMMd().format(d);
  return DateFormat.yMMMd().format(d);
}

String errorText(Object e) => e is ApiException ? e.message : 'Something went wrong. Pull to retry.';

class PriorityDot extends StatelessWidget {
  const PriorityDot(this.priority, {super.key});
  final Priority? priority;

  @override
  Widget build(BuildContext context) => Container(
        width: 9,
        height: 9,
        decoration: BoxDecoration(color: MpColors.priority(priority), shape: BoxShape.circle),
      );
}

class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, required this.color, this.icon});
  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 12, color: color), const SizedBox(width: 4)],
          Text(label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: color)),
        ]),
      );
}

class StateView extends StatelessWidget {
  const StateView({super.key, required this.icon, required this.title, this.message, this.action});
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(32, 96, 32, 32),
      children: [
        Icon(icon, size: 48, color: t.colorScheme.outline),
        const SizedBox(height: 16),
        Text(title, textAlign: TextAlign.center, style: t.textTheme.titleMedium),
        if (message != null) ...[
          const SizedBox(height: 6),
          Text(message!, textAlign: TextAlign.center, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.outline)),
        ],
        if (action != null) ...[const SizedBox(height: 20), Center(child: action)],
      ],
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState(this.error, {super.key, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => StateView(
        icon: Icons.cloud_off_rounded,
        title: 'Couldn\'t load',
        message: errorText(error),
        action: OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
      );
}

void toast(BuildContext context, String message, {SnackBarAction? action}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), action: action, behavior: SnackBarBehavior.floating));
}
