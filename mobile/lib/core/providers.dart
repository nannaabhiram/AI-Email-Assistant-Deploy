import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'models.dart';

final apiProvider = Provider<MailPilotApi>((ref) => MailPilotApi());

enum InboxFilter { all, high, career, unread, reply }

final inboxFilterProvider = NotifierProvider<InboxFilterNotifier, InboxFilter>(InboxFilterNotifier.new);

class InboxFilterNotifier extends Notifier<InboxFilter> {
  @override
  InboxFilter build() => InboxFilter.all;
  void set(InboxFilter f) => state = f;
}

final inboxProvider = FutureProvider.autoDispose<PageOf<EmailListItem>>((ref) {
  final api = ref.watch(apiProvider);
  return switch (ref.watch(inboxFilterProvider)) {
    InboxFilter.all => api.emails(),
    InboxFilter.high => api.emails(priority: [Priority.high]),
    InboxFilter.career => api.emails(category: 'career', sort: 'newest'),
    InboxFilter.unread => api.emails(unread: true),
    InboxFilter.reply => api.emails(replyNeeded: true),
  };
});

final emailProvider = FutureProvider.autoDispose.family<EmailDetail, String>((ref, id) => ref.watch(apiProvider).email(id));

final approvalsProvider = FutureProvider.autoDispose<PageOf<Approval>>(
  (ref) => ref.watch(apiProvider).approvals(states: ['PENDING_APPROVAL', 'PROPOSED', 'APPROVED', 'EXECUTING', 'FAILED']),
);

final tasksProvider = FutureProvider.autoDispose<PageOf<TaskItem>>((ref) => ref.watch(apiProvider).tasks());

final notificationsProvider = FutureProvider.autoDispose<PageOf<AppNotification>>(
  (ref) => ref.watch(apiProvider).notifications(),
);

final profileProvider = FutureProvider.autoDispose<Profile>((ref) => ref.watch(apiProvider).me());
