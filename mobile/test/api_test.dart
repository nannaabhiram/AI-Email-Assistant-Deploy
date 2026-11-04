import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mailpilot/core/api.dart';
import 'package:mailpilot/core/models.dart';

void main() {
  test('sends bearer token, repeats list params and parses pages', () async {
    late http.Request seen;
    final api = MailPilotApi(
      baseUrl: 'https://api.test/',
      token: () async => 'tok',
      client: MockClient((r) async {
        seen = r;
        return http.Response(jsonEncode({'items': [], 'total': 0, 'limit': 30, 'offset': 0}), 200);
      }),
    );
    final page = await api.emails(priority: [Priority.high, Priority.medium], unread: true);
    expect(page.total, 0);
    expect(seen.headers['Authorization'], 'Bearer tok');
    expect(seen.url.queryParametersAll['priority'], ['HIGH', 'MEDIUM']);
    expect(seen.url.queryParameters['unread'], 'true');
    expect(seen.url.queryParameters.containsKey('q'), isFalse);
  });

  test('maps API error envelopes to ApiException', () async {
    final api = MailPilotApi(
      baseUrl: 'https://api.test',
      token: () async => 'tok',
      client: MockClient((_) async => http.Response(
          jsonEncode({
            'error': {
              'code': 'external_recipients_unconfirmed',
              'message': 'Confirm them',
              'details': {'external_recipients': ['x@y.test']},
            }
          }),
          422)),
    );
    await expectLater(
      api.requestApproval('d'),
      throwsA(isA<ApiException>()
          .having((e) => e.code, 'code', 'external_recipients_unconfirmed')
          .having((e) => e.details['external_recipients'], 'details', ['x@y.test'])),
    );
  });
}
