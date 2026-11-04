import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api.dart';

// FCM registration tokens are what the backend's HTTP v1 sender targets; the newer FID direct-send
// API (register/onRegistered) is not used until the backend supports it.
// ignore_for_file: deprecated_member_use

const _important = AndroidNotificationChannel(
  'important',
  'Important mail',
  description: 'Internship and job offers, interviews and other high-priority mail',
  importance: Importance.max,
);
const _general = AndroidNotificationChannel(
  'general',
  'General',
  description: 'Reminders, briefings and approvals',
  importance: Importance.defaultImportance,
);

@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // Notification payloads are displayed by the OS while the app is in the background.
}

/// FCM registration, foreground display and tap-to-open routing.
class PushService {
  PushService(this._api, this._open);

  final MailPilotApi _api;
  final void Function(String link) _open;
  final _local = FlutterLocalNotificationsPlugin();
  StreamSubscription<String>? _refreshSub;
  String? _token;
  bool _ready = false;

  static bool firebaseAvailable = false;

  static Future<void> initFirebase() async {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
      firebaseAvailable = true;
    } catch (e) {
      debugPrint('Push disabled: Firebase not configured ($e)');
    }
  }

  Future<void> start() async {
    if (!firebaseAvailable || _ready) return;
    _ready = true;
    final messaging = FirebaseMessaging.instance;

    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (r) {
        final link = r.payload;
        if (link != null && link.isNotEmpty) _open(link);
      },
    );
    final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(_important);
    await android?.createNotificationChannel(_general);

    final settings = await messaging.requestPermission(alert: true, badge: true, sound: true);
    if (settings.authorizationStatus == AuthorizationStatus.denied) return;
    // iOS shows the system banner itself while foregrounded; Android needs a local notification.
    await messaging.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

    FirebaseMessaging.onMessage.listen(_showForeground);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleOpen);
    final initial = await messaging.getInitialMessage();
    if (initial != null) _handleOpen(initial);

    await _register(await messaging.getToken());
    _refreshSub = messaging.onTokenRefresh.listen(_register);
  }

  Future<void> _register(String? token) async {
    if (token == null) return;
    _token = token;
    try {
      await _api.registerDevice(token: token, platform: Platform.isIOS ? 'ios' : 'android', appVersion: '1.0.0');
    } catch (e) {
      debugPrint('Device registration failed: $e');
    }
  }

  void _handleOpen(RemoteMessage m) {
    final link = m.data['link'];
    if (link is String && link.isNotEmpty) _open(link);
  }

  Future<void> _showForeground(RemoteMessage m) async {
    final n = m.notification;
    if (n == null || !Platform.isAndroid) return;
    final important = m.data['kind'] == 'important';
    final channel = important ? _important : _general;
    await _local.show(
      id: m.hashCode,
      title: n.title,
      body: n.body,
      payload: m.data['link'] as String?,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: channel.importance,
          priority: important ? Priority.max : Priority.defaultPriority,
          styleInformation: BigTextStyleInformation(n.body ?? ''),
        ),
      ),
    );
  }

  /// Call on sign-out so this phone stops receiving the previous user's mail alerts.
  Future<void> stop() async {
    await _refreshSub?.cancel();
    _refreshSub = null;
    final token = _token;
    _ready = false;
    if (token == null) return;
    try {
      await _api.unregisterDevice(token);
    } catch (_) {}
    if (firebaseAvailable) await FirebaseMessaging.instance.deleteToken();
    _token = null;
  }
}
