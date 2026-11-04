/// Build-time configuration, passed with `--dart-define-from-file=env/prod.json`.
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://mailpilot-api-cpi3.onrender.com',
  );
  static const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://hrejavjzfezqydneeatp.supabase.co',
  );
  static const supabasePublishableKey = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
  static const webAppUrl = String.fromEnvironment(
    'WEB_APP_URL',
    defaultValue: 'https://mailpilot-web-n41v.onrender.com',
  );

  /// Deep link Supabase redirects to after Google sign-in. Must be in the Supabase redirect allow-list.
  static const authRedirect = 'in.mailpilot.app://login-callback';

  static bool get supabaseConfigured => supabasePublishableKey.isNotEmpty;
}
