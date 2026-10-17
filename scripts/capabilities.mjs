// Port of NativeCapabilities (ui/NativePermissions.kt). One table decides, per
// capability, the manifest permissions, the runtime prompt, the Gradle
// libraries and the adapter file an export carries. The exporter, the preview's
// permission prompts and set_permissions all read it.

export const CAPABILITIES = [
  { id: 'camera', manifestPermissions: ['android.permission.CAMERA'],
    description: "Take photos in the app with native.pickImage({source:'camera'})." },
  { id: 'microphone', manifestPermissions: ['android.permission.RECORD_AUDIO'], description: 'Record audio.' },
  { id: 'location',
    manifestPermissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
    description: "Read the device's location." },
  { id: 'notifications', manifestPermissions: ['android.permission.POST_NOTIFICATIONS'], minSdk: 33,
    description: 'Show notifications.' },
  { id: 'network', manifestPermissions: ['android.permission.ACCESS_NETWORK_STATE'], runtimePermissions: [],
    description: 'Read connectivity state and watch for changes (native.network).' },
  { id: 'push', manifestPermissions: ['android.permission.POST_NOTIFICATIONS'], minSdk: 33,
    description: 'Firebase push (native.pushToken, native:push). The exported app gets the FCM wiring, but it ' +
      'only works once YOUR google-services.json is added to app/ -- say so rather than promising it works out of the box.' },
  { id: 'exactAlarm', manifestPermissions: ['android.permission.SCHEDULE_EXACT_ALARM'], runtimePermissions: [], minSdk: 31,
    description: 'Notifications that fire at an exact minute (native.scheduleNotification with exact:true). Only ' +
      'declare it when a late reminder would be useless -- Play restricts this permission.' },
  { id: 'contacts', manifestPermissions: ['android.permission.READ_CONTACTS'], description: "Read the device's contacts." },
  { id: 'calendar', manifestPermissions: ['android.permission.READ_CALENDAR', 'android.permission.WRITE_CALENDAR'],
    description: 'Read and add calendar events.' },
  { id: 'vibrate', manifestPermissions: ['android.permission.VIBRATE'], runtimePermissions: [],
    description: 'Vibration patterns beyond the standard haptic tick.' },
  { id: 'biometric', manifestPermissions: ['android.permission.USE_BIOMETRIC'], runtimePermissions: [],
    dependencies: ['androidx.biometric:biometric:1.1.0', 'androidx.fragment:fragment-ktx:1.8.9'],
    adapter: 'BiometricSupport', needsFragmentActivity: true,
    description: 'Fingerprint or face unlock inside the app (native.biometric).' },
  { id: 'barcode', manifestPermissions: [],
    dependencies: ['com.google.android.gms:play-services-code-scanner:16.1.0'], adapter: 'BarcodeSupport',
    description: 'Scan barcodes and QR codes (native.scanBarcode).' },
  { id: 'secureStorage', manifestPermissions: [], dependencies: ['androidx.security:security-crypto:1.0.0'],
    adapter: 'SecureStoreSupport', description: 'Encrypted storage for tokens and PINs (native.secure.*).' },
  { id: 'review', manifestPermissions: [], dependencies: ['com.google.android.play:review-ktx:2.0.2'],
    adapter: 'ReviewSupport', description: 'The Play in-app review prompt (native.requestReview).' },
  { id: 'ads', manifestPermissions: [], dependencies: ['com.google.android.gms:play-services-ads:23.6.0'],
    adapter: 'AdsSupport', description: 'AdMob banner, interstitial and rewarded ads. Configure with set_ads.' },
].map((c) => ({
  runtimePermissions: c.manifestPermissions,
  minSdk: 0,
  maxSdk: null,
  dependencies: [],
  adapter: null,
  needsFragmentActivity: false,
  ...c,
}));

export const CAPABILITY_IDS = CAPABILITIES.map((c) => c.id);
export const capabilityById = (id) => CAPABILITIES.find((c) => c.id === id) || null;

export function dependencyLines(ids) {
  const deps = [...new Set(ids.map(capabilityById).filter(Boolean).flatMap((c) => c.dependencies))].sort();
  return deps.map((d) => `    implementation("${d}")`);
}

export const adapters = (ids) => [...new Set(ids.map(capabilityById).filter((c) => c && c.adapter).map((c) => c.adapter))];

export const needsFragmentActivity = (ids) => ids.map(capabilityById).some((c) => c && c.needsFragmentActivity);

export function manifestLines(ids) {
  const lines = new Set();
  for (const id of ids) {
    const c = capabilityById(id);
    if (!c) continue;
    for (const permission of c.manifestPermissions) {
      let attributes = `android:name="${permission}"`;
      if (c.maxSdk != null) attributes += ` android:maxSdkVersion="${c.maxSdk}"`;
      lines.add(`    <uses-permission ${attributes}/>`);
    }
  }
  // Kotlin uses a sortedSetOf, so the manifest is stable between exports.
  return [...lines].sort();
}

/**
 * Which capability each native call needs, matched against the code the model
 * writes (BuilderAgent.CAPABILITY_TRIGGERS). Only gated calls appear here.
 */
export const CAPABILITY_TRIGGERS = {
  camera: /source\s*:\s*['"]camera['"]|native\.pickImage\s*\(\s*\{[^}]*camera/,
  location: /native\.(watchLocation|location)\b/,
  network: /native\.(watchNetwork|network)\b/,
  notifications: /native\.(notify|scheduleNotification|cancelNotification|cancelAllNotifications|notificationsEnabled)\b/,
  push: /native\.(pushToken|subscribeTopic)\b/,
  vibrate: /native\.vibrate\b/,
  biometric: /native\.biometric\b/,
  barcode: /native\.scanBarcode\b/,
  secureStorage: /native\.secure\b/,
  review: /native\.requestReview\b/,
  contacts: /native\.pickContact\b/,
  calendar: /native\.addCalendarEvent\b/,
};
