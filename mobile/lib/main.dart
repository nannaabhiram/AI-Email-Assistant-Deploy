import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'core/config.dart';
import 'core/push.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  await Future.wait([
    PushService.initFirebase(),
    if (AppConfig.supabaseConfigured)
      Supabase.initialize(
        url: AppConfig.supabaseUrl,
        publishableKey: AppConfig.supabasePublishableKey,
        authOptions: const FlutterAuthClientOptions(authFlowType: AuthFlowType.pkce),
      ),
  ]);
  runApp(const ProviderScope(child: MailPilotApp()));
}
