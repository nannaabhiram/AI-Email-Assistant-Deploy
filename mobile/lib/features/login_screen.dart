import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/config.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _busy = false;

  Future<void> _google() async {
    setState(() => _busy = true);
    try {
      await Supabase.instance.client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: AppConfig.authRedirect,
        authScreenLaunchMode: LaunchMode.externalApplication,
        queryParams: const {'prompt': 'select_account'},
      );
    } on AuthException catch (e) {
      if (mounted) toast(context, e.message);
    } catch (_) {
      if (mounted) toast(context, 'Could not open Google sign-in.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF312E81), MpColors.brand, Color(0xFF0EA5E9)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Spacer(),
                const Icon(Icons.mark_email_unread_rounded, size: 56, color: Colors.white),
                const SizedBox(height: 20),
                Text('MailPilot',
                    style: t.textTheme.displaySmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text('Your AI email agent. Offers and interviews first, everything else sorted.',
                    style: t.textTheme.titleMedium?.copyWith(color: Colors.white70)),
                const Spacer(flex: 2),
                if (!AppConfig.supabaseConfigured)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: Text('Build is missing SUPABASE_PUBLISHABLE_KEY (see mobile/README.md).',
                        style: TextStyle(color: Colors.amberAccent)),
                  ),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Colors.black87),
                    onPressed: _busy || !AppConfig.supabaseConfigured ? null : _google,
                    icon: _busy
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.login_rounded),
                    label: const Text('Continue with Google'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
