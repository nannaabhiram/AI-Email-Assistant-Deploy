DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
List<String> _strings(Object? v) => v is List ? v.map((e) => e.toString()).toList() : const [];

enum Priority {
  high,
  medium,
  low;

  static Priority? parse(Object? v) => switch (v) {
        'HIGH' => Priority.high,
        'MEDIUM' => Priority.medium,
        'LOW' => Priority.low,
        _ => null,
      };

  String get api => name.toUpperCase();
}

class PageOf<T> {
  const PageOf(this.items, this.total);
  final List<T> items;
  final int total;

  static PageOf<T> parse<T>(Map<String, dynamic> j, T Function(Map<String, dynamic>) item) => PageOf(
        (j['items'] as List).cast<Map<String, dynamic>>().map(item).toList(),
        (j['total'] as num?)?.toInt() ?? 0,
      );
}

class EmailListItem {
  EmailListItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        threadId = j['thread_id'] as String,
        subject = j['subject'] as String?,
        snippet = j['snippet'] as String?,
        fromAddress = j['from_address'] as String?,
        fromName = j['from_name'] as String?,
        date = _date(j['internal_date']) ?? DateTime.now(),
        isUnread = j['is_unread'] == true,
        hasAttachments = j['has_attachments'] == true,
        priority = Priority.parse(j['priority']),
        summary = j['summary'] as String?,
        replyNeeded = j['reply_needed'] == true,
        actionRequired = j['action_required'] == true,
        deadlineAt = _date(j['deadline_at']),
        riskLevel = j['risk_level'] as String?,
        category = j['category'] as String?,
        isVip = j['is_vip'] == true;

  final String id;
  final String threadId;
  final String? subject;
  final String? snippet;
  final String? fromAddress;
  final String? fromName;
  final DateTime date;
  final bool isUnread;
  final bool hasAttachments;
  final Priority? priority;
  final String? summary;
  final bool replyNeeded;
  final bool actionRequired;
  final DateTime? deadlineAt;
  final String? riskLevel;
  final String? category;
  final bool isVip;

  String get sender => (fromName?.isNotEmpty ?? false) ? fromName! : (fromAddress ?? 'Unknown sender');
  bool get isCareer => category == 'career';
  bool get isRisky => riskLevel == 'medium' || riskLevel == 'high';
}

class Analysis {
  Analysis.fromJson(Map<String, dynamic> j)
      : priority = Priority.parse(j['effective_priority'] ?? j['priority']),
        score = (j['priority_score'] as num?)?.toInt(),
        summary = j['summary'] as String? ?? '',
        explanation = j['explanation'] as String? ?? '',
        suggestedAction = j['suggested_action'] as String?,
        deadlineAt = _date(j['deadline_at']),
        deadlineText = j['deadline_text'] as String?,
        category = j['category'] as String?,
        escalationReason = j['escalation_reason'] as String?,
        riskLevel = j['risk_level'] as String? ?? 'none',
        riskFlags = ((j['risk_flags'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map((f) => f['detail']?.toString() ?? f['code'].toString())
            .toList(),
        replyNeeded = j['reply_needed'] == true;

  final Priority? priority;
  final int? score;
  final String summary;
  final String explanation;
  final String? suggestedAction;
  final DateTime? deadlineAt;
  final String? deadlineText;
  final String? category;
  final String? escalationReason;
  final String riskLevel;
  final List<String> riskFlags;
  final bool replyNeeded;
}

class EmailDetail {
  EmailDetail.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        threadId = j['thread_id'] as String,
        subject = j['subject'] as String?,
        fromAddress = j['from_address'] as String?,
        fromName = j['from_name'] as String?,
        to = ((j['to_addresses'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map((a) => a['email'] as String)
            .toList(),
        date = _date(j['internal_date']) ?? DateTime.now(),
        isUnread = j['is_unread'] == true,
        bodyText = j['body_text'] as String?,
        hasHtml = j['has_html'] == true,
        analysis = j['analysis'] is Map<String, dynamic> ? Analysis.fromJson(j['analysis'] as Map<String, dynamic>) : null,
        attachments = ((j['attachments'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map((a) => a['filename'] as String)
            .toList();

  final String id;
  final String threadId;
  final String? subject;
  final String? fromAddress;
  final String? fromName;
  final List<String> to;
  final DateTime date;
  final bool isUnread;
  final String? bodyText;
  final bool hasHtml;
  final Analysis? analysis;
  final List<String> attachments;

  String get sender => (fromName?.isNotEmpty ?? false) ? '$fromName <$fromAddress>' : (fromAddress ?? 'Unknown sender');
}

class Draft {
  Draft.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        to = _strings(j['to_addresses']),
        cc = _strings(j['cc_addresses']),
        subject = j['subject'] as String? ?? '',
        body = j['body'] as String? ?? '',
        status = j['status'] as String? ?? 'draft',
        source = j['source'] as String? ?? 'user',
        version = (j['version'] as num?)?.toInt() ?? 1;

  final String id;
  final List<String> to;
  final List<String> cc;
  final String subject;
  final String body;
  final String status;
  final String source;
  final int version;
}

class Approval {
  Approval.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        actionType = j['action_type'] as String,
        params = (j['params'] as Map?)?.cast<String, dynamic>() ?? const {},
        paramsHash = j['params_hash'] as String,
        explanation = j['explanation'] as String? ?? '',
        state = j['state'] as String,
        createdAt = _date(j['created_at']) ?? DateTime.now(),
        expiresAt = _date(j['expires_at']),
        error = (j['execution'] as Map?)?['error'] as String?;

  final String id;
  final String actionType;
  final Map<String, dynamic> params;
  final String paramsHash;
  final String explanation;
  final String state;
  final DateTime createdAt;
  final DateTime? expiresAt;
  final String? error;

  bool get isPending => state == 'PENDING_APPROVAL' || state == 'PROPOSED';
  List<String> get to => _strings(params['to']);
  String get subject => params['subject']?.toString() ?? '';
  String get body => params['body']?.toString() ?? '';
  int get messageCount => _strings(params['gmail_message_ids']).length;

  String get title => switch (actionType) {
        'send_reply' => subject.isEmpty ? 'Send email' : subject,
        'archive' => 'Archive $messageCount email(s)',
        'trash' => 'Move $messageCount email(s) to trash',
        'mark_read' => 'Mark $messageCount email(s) read',
        'mark_unread' => 'Mark $messageCount email(s) unread',
        'apply_label' => 'Label $messageCount email(s) "${params['label_name'] ?? ''}"',
        'remove_label' => 'Remove label from $messageCount email(s)',
        _ => actionType,
      };
}

class TaskItem {
  TaskItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        description = j['description'] as String?,
        dueAt = _date(j['due_at']),
        status = j['status'] as String,
        sourceMessageId = j['source_message_id'] as String?,
        version = (j['version'] as num).toInt();

  final String id;
  final String title;
  final String? description;
  final DateTime? dueAt;
  final String status;
  final String? sourceMessageId;
  final int version;

  bool get done => status == 'done';
  bool get overdue => !done && dueAt != null && dueAt!.isBefore(DateTime.now());
}

class AppNotification {
  AppNotification.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        kind = j['kind'] as String,
        title = j['title'] as String,
        body = j['body'] as String?,
        link = j['link'] as String?,
        read = j['read_at'] != null,
        createdAt = _date(j['created_at']) ?? DateTime.now();

  final String id;
  final String kind;
  final String title;
  final String? body;
  final String? link;
  final bool read;
  final DateTime createdAt;

  bool get important => kind == 'important';
}

class Recipient {
  Recipient.fromJson(Map<String, dynamic> j)
      : email = j['email'] as String,
        name = j['name'] as String?,
        isVip = j['is_vip'] == true;

  final String email;
  final String? name;
  final bool isVip;
}

class ComposeResult {
  ComposeResult.fromJson(Map<String, dynamic> j)
      : approvalId = j['approval_id'] as String,
        sendAt = _date(j['send_at']) ?? DateTime.now();

  final String approvalId;
  final DateTime sendAt;
}

class Profile {
  Profile.fromJson(Map<String, dynamic> j)
      : email = j['email'] as String? ?? '',
        displayName = j['display_name'] as String?;

  final String email;
  final String? displayName;
}
