import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'models.dart';

class ApiException implements Exception {
  ApiException(this.status, this.code, this.message, [this.details = const {}]);
  final int status;
  final String code;
  final String message;
  final Map<String, dynamic> details;

  @override
  String toString() => message;
}

typedef Query = Map<String, Object?>;

/// Thin typed client for the MailPilot API. Only the Supabase access token leaves the device.
class MailPilotApi {
  MailPilotApi({http.Client? client, Future<String?> Function()? token, String? baseUrl})
      : _http = client ?? http.Client(),
        _token = token ?? _supabaseToken,
        _base = (baseUrl ?? AppConfig.apiBaseUrl).replaceAll(RegExp(r'/$'), '');

  final http.Client _http;
  final Future<String?> Function() _token;
  final String _base;

  static Future<String?> _supabaseToken() async {
    final auth = Supabase.instance.client.auth;
    var session = auth.currentSession;
    if (session != null && session.isExpired) {
      session = (await auth.refreshSession()).session;
    }
    return session?.accessToken;
  }

  Uri _uri(String path, [Query? query]) {
    final params = <String, List<String>>{};
    query?.forEach((k, v) {
      if (v == null || v == '') return;
      params[k] = v is List ? v.map((e) => e.toString()).toList() : [v.toString()];
    });
    final base = Uri.parse('$_base$path');
    return params.isEmpty ? base : base.replace(queryParameters: params);
  }

  Future<dynamic> _send(String method, String path, {Object? body, Query? query}) async {
    final token = await _token();
    final req = http.Request(method, _uri(path, query))
      ..headers['Accept'] = 'application/json';
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    http.Response res;
    try {
      // Render free instances cold-start in ~50 s; keep the timeout above that.
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 75)));
    } on TimeoutException {
      throw ApiException(0, 'timeout', 'The server is waking up. Try again in a moment.');
    } catch (_) {
      throw ApiException(0, 'network_error', 'Cannot reach MailPilot. Check your connection.');
    }
    if (res.statusCode == 204 || res.body.isEmpty) return null;
    final data = jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) {
      final err = (data is Map ? data['error'] : null) as Map<String, dynamic>?;
      throw ApiException(
        res.statusCode,
        err?['code'] as String? ?? 'http_error',
        err?['message'] as String? ?? 'Request failed (${res.statusCode})',
        (err?['details'] as Map?)?.cast<String, dynamic>() ?? const {},
      );
    }
    return data;
  }

  Map<String, dynamic> _map(Object? v) => (v as Map).cast<String, dynamic>();

  Future<Profile> me() async => Profile.fromJson(_map(await _send('GET', '/api/v1/me')));

  Future<PageOf<EmailListItem>> emails({
    int limit = 30,
    int offset = 0,
    List<Priority>? priority,
    bool? unread,
    bool? replyNeeded,
    String? category,
    String? q,
    String sort = 'priority',
  }) async =>
      PageOf.parse(
        _map(await _send('GET', '/api/v1/emails', query: {
          'limit': limit,
          'offset': offset,
          'priority': priority?.map((p) => p.api).toList(),
          'unread': unread,
          'reply_needed': replyNeeded,
          'category': category,
          'q': q,
          'sort': sort,
        })),
        EmailListItem.fromJson,
      );

  Future<EmailDetail> email(String id) async => EmailDetail.fromJson(_map(await _send('GET', '/api/v1/emails/$id')));

  Future<void> setPriority(String id, Priority? p) =>
      _send('POST', '/api/v1/emails/$id/priority', body: {'priority': p?.api});

  Future<Draft> createReplyDraft(String messageId, {String tone = 'professional', String? instructions}) async =>
      Draft.fromJson(_map(await _send('POST', '/api/v1/drafts', body: {
        'message_id': messageId,
        'tone': tone,
        'instructions': instructions,
        'use_ai': true,
      })));

  Future<Draft> updateDraft(Draft d, {required String subject, required String body, List<String>? to}) async =>
      Draft.fromJson(_map(await _send('PATCH', '/api/v1/drafts/${d.id}', body: {
        'version': d.version,
        'subject': subject,
        'body': body,
        'to': ?to,
      })));

  Future<void> discardDraft(String id) => _send('DELETE', '/api/v1/drafts/$id');

  Future<Approval> requestApproval(String draftId, {bool acknowledgeExternal = false}) async =>
      Approval.fromJson(_map(await _send('POST', '/api/v1/drafts/$draftId/request-approval',
          body: {'acknowledge_external_recipients': acknowledgeExternal})));

  Future<ComposeResult> composeSend({
    required List<String> to,
    List<String> cc = const [],
    List<String> bcc = const [],
    required String subject,
    required String body,
    int undoSeconds = 10,
  }) async =>
      ComposeResult.fromJson(_map(await _send('POST', '/api/v1/compose/send', body: {
        'to': to,
        'cc': cc,
        'bcc': bcc,
        'subject': subject,
        'body': body,
        'undo_seconds': undoSeconds,
      })));

  Future<void> undoSend(String approvalId) => _send('POST', '/api/v1/compose/$approvalId/undo');

  Future<List<Recipient>> recipients(String q) async {
    final j = _map(await _send('GET', '/api/v1/compose/recipients', query: {'q': q, 'limit': 8}));
    return (j['items'] as List).cast<Map<String, dynamic>>().map(Recipient.fromJson).toList();
  }

  Future<PageOf<Approval>> approvals({List<String>? states}) async =>
      PageOf.parse(_map(await _send('GET', '/api/v1/approvals', query: {'state': states})), Approval.fromJson);

  Future<Approval> approve(Approval a) async =>
      Approval.fromJson(_map(await _send('POST', '/api/v1/approvals/${a.id}/approve', body: {'params_hash': a.paramsHash})));

  Future<Approval> reject(String id) async =>
      Approval.fromJson(_map(await _send('POST', '/api/v1/approvals/$id/reject', body: {'reason': 'Rejected on mobile'})));

  Future<PageOf<TaskItem>> tasks({List<String> status = const ['open', 'suggested']}) async =>
      PageOf.parse(_map(await _send('GET', '/api/v1/tasks', query: {'status': status, 'limit': 100})), TaskItem.fromJson);

  Future<TaskItem> setTaskStatus(TaskItem t, String status) async =>
      TaskItem.fromJson(_map(await _send('PATCH', '/api/v1/tasks/${t.id}', body: {'status': status, 'version': t.version})));

  Future<PageOf<AppNotification>> notifications() async =>
      PageOf.parse(_map(await _send('GET', '/api/v1/notifications', query: {'limit': 50})), AppNotification.fromJson);

  Future<void> readNotification(String id) => _send('POST', '/api/v1/notifications/$id/read');
  Future<void> readAllNotifications() => _send('POST', '/api/v1/notifications/read-all');

  Future<void> registerDevice({required String token, required String platform, String? appVersion}) =>
      _send('POST', '/api/v1/devices', body: {'token': token, 'platform': platform, 'app_version': appVersion});

  Future<void> unregisterDevice(String token) => _send('POST', '/api/v1/devices/unregister', body: {'token': token});
  Future<void> testPush() => _send('POST', '/api/v1/devices/test');
}
