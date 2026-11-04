import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mailpilot/core/models.dart';
import 'package:mailpilot/core/providers.dart';
import 'package:mailpilot/features/inbox_screen.dart';
import 'package:mailpilot/ui/theme.dart';

void main() {
  testWidgets('inbox renders emails with career badge', (tester) async {
    final item = EmailListItem.fromJson({
      'id': 'a',
      'thread_id': 't',
      'subject': 'Internship offer - SWE',
      'from_name': 'Acme HR',
      'internal_date': DateTime.now().toIso8601String(),
      'priority': 'HIGH',
      'category': 'career',
      'summary': 'You have been selected for the summer internship.',
    });
    await tester.pumpWidget(ProviderScope(
      overrides: [inboxProvider.overrideWith((ref) async => PageOf([item], 1))],
      child: MaterialApp(theme: buildTheme(Brightness.light), home: const InboxScreen()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Internship offer - SWE'), findsOneWidget);
    expect(find.text('Career'), findsOneWidget);
    expect(find.text('Offers & interviews'), findsOneWidget);
  });
}
