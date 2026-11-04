import 'package:flutter_test/flutter_test.dart';
import 'package:mailpilot/app.dart' show appRouteFor;
import 'package:mailpilot/core/models.dart';

void main() {
  test('email list item parses analysis fields and career flag', () {
    final e = EmailListItem.fromJson({
      'id': 'a',
      'thread_id': 't',
      'subject': 'Offer letter',
      'from_name': 'Acme HR',
      'from_address': 'hr@acme.test',
      'internal_date': '2026-11-04T10:00:00Z',
      'is_unread': true,
      'priority': 'HIGH',
      'category': 'career',
      'risk_level': 'none',
    });
    expect(e.priority, Priority.high);
    expect(e.isCareer, isTrue);
    expect(e.isRisky, isFalse);
    expect(e.sender, 'Acme HR');
  });

  test('approval titles describe bulk actions', () {
    final a = Approval.fromJson({
      'id': '1',
      'action_type': 'trash',
      'params': {'gmail_message_ids': ['x', 'y']},
      'params_hash': 'h',
      'state': 'PENDING_APPROVAL',
      'created_at': '2026-11-04T10:00:00Z',
    });
    expect(a.title, 'Move 2 email(s) to trash');
    expect(a.isPending, isTrue);
  });

  test('notification links map to app routes', () {
    expect(appRouteFor('/emails/0b4a6f5e-2c1d-4e5f-8a9b-1c2d3e4f5a6b'), '/emails/0b4a6f5e-2c1d-4e5f-8a9b-1c2d3e4f5a6b');
    expect(appRouteFor('/approvals?id=1'), '/approvals');
    expect(appRouteFor('/tasks'), '/tasks');
    expect(appRouteFor('/notifications'), '/alerts');
    expect(appRouteFor('/somewhere-else'), '/inbox');
  });
}
