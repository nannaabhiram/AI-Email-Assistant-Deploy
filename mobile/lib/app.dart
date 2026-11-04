import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/config.dart';
import 'core/providers.dart';
import 'core/push.dart';
import 'features/alerts_screen.dart';
import 'features/approvals_screen.dart';
import 'features/compose_screen.dart';
import 'features/email_screen.dart';
import 'features/inbox_screen.dart';
import 'features/login_screen.dart';
import 'features/settings_screen.dart';
import 'features/shell.dart';
import 'features/tasks_screen.dart';
import 'ui/theme.dart';

final _rootKey = GlobalKey<NavigatorState>();

bool get _signedIn => AppConfig.supabaseConfigured && Supabase.instance.client.auth.currentSession != null;

/// Maps backend notification links (web routes) to app routes.
String appRouteFor(String link) {
  final uri = Uri.tryParse(link);
  final path = uri?.path ?? '/';
  if (RegExp(r'^/emails/[0-9a-fA-F-]{36}$').hasMatch(path)) return path;
  if (path.startsWith('/approvals')) return '/approvals';
  if (path.startsWith('/tasks')) return '/tasks';
  if (path.startsWith('/notifications') || path.startsWith('/briefings')) return '/alerts';
  return '/inbox';
}

final routerProvider = Provider<GoRouter>((ref) {
  final authChanges = AppConfig.supabaseConfigured
      ? Supabase.instance.client.auth.onAuthStateChange
      : const Stream<AuthState>.empty();
  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/inbox',
    refreshListenable: _StreamListenable(authChanges),
    redirect: (_, state) {
      final atLogin = state.matchedLocation == '/login';
      if (!_signedIn) return atLogin ? null : '/login';
      if (atLogin) return '/inbox';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/inbox', builder: (_, _) => const InboxScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/approvals', builder: (_, _) => const ApprovalsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/tasks', builder: (_, _) => const TasksScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/alerts', builder: (_, _) => const AlertsScreen())]),
        ],
      ),
      GoRoute(
        path: '/emails/:id',
        parentNavigatorKey: _rootKey,
        builder: (_, s) => EmailScreen(id: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/compose',
        parentNavigatorKey: _rootKey,
        pageBuilder: (_, s) => MaterialPage(fullscreenDialog: true, child: ComposeScreen(prefillTo: s.uri.queryParameters['to'])),
      ),
      GoRoute(path: '/settings', parentNavigatorKey: _rootKey, builder: (_, _) => const SettingsScreen()),
    ],
  );
});

final pushProvider = Provider<PushService>((ref) {
  final router = ref.watch(routerProvider);
  return PushService(ref.watch(apiProvider), (link) => router.push(appRouteFor(link)));
});

class MailPilotApp extends ConsumerStatefulWidget {
  const MailPilotApp({super.key});

  @override
  ConsumerState<MailPilotApp> createState() => _MailPilotAppState();
}

class _MailPilotAppState extends ConsumerState<MailPilotApp> {
  StreamSubscription<AuthState>? _auth;

  @override
  void initState() {
    super.initState();
    if (!AppConfig.supabaseConfigured) return;
    if (_signedIn) ref.read(pushProvider).start();
    _auth = Supabase.instance.client.auth.onAuthStateChange.listen((s) {
      if (s.event == AuthChangeEvent.signedIn) ref.read(pushProvider).start();
    });
  }

  @override
  void dispose() {
    _auth?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'MailPilot',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        routerConfig: ref.watch(routerProvider),
      );
}

class _StreamListenable extends ChangeNotifier {
  _StreamListenable(Stream<dynamic> stream) {
    _sub = stream.listen((_) => notifyListeners());
  }
  late final StreamSubscription<dynamic> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}
