// Assembles one app's Android project for CI from the fixed template and the
// app's own data. Same output as the builder's old exporter
// (src/export/kotlinExporter.js), which this replaces.
//
//   in:  job/build.json   { target, name, packageName, versionCode, versionName }
//        job/www/**       the app (project.json, screens/, shared/...)
//        job/icon.png     optional launcher icon
//        job/google-services.json  optional (Firebase push)
//   out: project/         a complete Gradle project, signed from SIGN_* env vars
//
// Run: node scripts/prepare.mjs
import fs from 'node:fs';
import path from 'node:path';
import { adapters, dependencyLines, manifestLines, needsFragmentActivity } from './capabilities.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const T = path.join(ROOT, 'template');
const JOB = path.join(ROOT, 'job');
const OUT = path.join(ROOT, 'project');

const KOTLIN_SOURCES = [
  'MainActivity.kt', 'AppShell.kt', 'NativeComponents.kt', 'NativeMedia.kt', 'NativePermissions.kt',
  'NativeDevice.kt', 'NativeSecurity.kt', 'NativeNotifications.kt', 'NativeApp.kt', 'NativeAds.kt',
  'AppManifest.kt', 'AssetServer.kt', 'AppStorage.kt',
];

const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (rel, content) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const copy = (from, rel, mode) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.copyFileSync(from, p);
  if (mode) fs.chmodSync(p, mode);
};

// ---- Inputs -----------------------------------------------------------------------------
const job = JSON.parse(read(path.join(JOB, 'build.json')));
const m = JSON.parse(read(path.join(JOB, 'www', 'project.json')));
const name = String(job.name || m.name || 'My App').trim();
const pkg = String(job.packageName || '');
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/.test(pkg)) fail(`Invalid package name "${pkg}".`);
const versionCode = Math.max(1, parseInt(job.versionCode, 10) || 1);
const versionName = String(job.versionName || '1.0.0').replace(/[^0-9A-Za-z._-]/g, '') || '1.0.0';

const permissions = Array.isArray(m.permissions) ? m.permissions : [];
const ads = m.ads && m.ads.enabled ? m.ads : { enabled: false };
const caps = [...new Set([...permissions, ...(ads.enabled ? ['ads'] : [])])];
const usesPush = permissions.includes('push');
const pushProvider = usesPush ? (m.push?.provider === 'onesignal' && m.push.onesignalAppId ? 'onesignal' : 'firebase') : '';
const deepLinks = (Array.isArray(m.deepLinks) ? m.deepLinks : []).filter((l) => l && l.host);
const adsTestAppId = read(path.join(T, 'ads_test_app_id.txt')).trim();

// ---- Template pieces (same text as the old exporter) -----------------------------------------
const xml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const deepLinkFilters = deepLinks
  .map((l) => {
    const autoVerify = l.scheme === 'https' ? ' android:autoVerify="true"' : '';
    const p = l.path ? `\n                    android:pathPrefix="${xml(l.path)}"` : '';
    return (
      `            <intent-filter${autoVerify}>\n` +
      '                <action android:name="android.intent.action.VIEW"/>\n' +
      '                <category android:name="android.intent.category.DEFAULT"/>\n' +
      '                <category android:name="android.intent.category.BROWSABLE"/>\n' +
      '                <data\n' +
      `                    android:scheme="${xml(l.scheme)}"\n` +
      `                    android:host="${xml(l.host)}"${p}/>\n` +
      '            </intent-filter>'
    );
  })
  .join('\n');
const adsMeta = (appId) => `
        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="${appId}"/>`;
const PUSH_PLUGIN = `if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}`;
const PUSH_DEPENDENCY = `
    implementation(platform("com.google.firebase:firebase-bom:34.1.0"))
    implementation("com.google.firebase:firebase-messaging")`;
const PUSH_SERVICE = `
        <service
            android:name=".PushService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT"/>
            </intent-filter>
        </service>
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="generated_app_alerts_v2"/>`;
const ONESIGNAL_DEPENDENCY = `
    implementation("com.onesignal:OneSignal:[5.1.6, 5.1.99]")`;
const ONESIGNAL_SERVICE = `
        <meta-data
            android:name="com.onesignal.NotificationServiceExtension"
            android:value="{{PACKAGE}}.PushNotificationExtension"/>`;
// The account's own key, handed to this run by the builder's server (see the workflow).
const SIGNING = `    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("SIGN_STORE_FILE") ?: "missing-signing-key")
            storePassword = System.getenv("SIGN_STORE_PASSWORD")
            keyAlias = System.getenv("SIGN_KEY_ALIAS")
            keyPassword = System.getenv("SIGN_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }`;

const fragment = needsFragmentActivity(caps);
const fill = (text) =>
  text
    .replaceAll('{{DEEP_LINKS}}', deepLinkFilters)
    .replaceAll('{{CAPABILITY_DEPENDENCIES}}', dependencyLines(caps).join('\n'))
    .replaceAll('{{ACTIVITY_BASE}}', fragment ? 'FragmentActivity' : 'ComponentActivity')
    .replaceAll('{{ACTIVITY_IMPORT}}', fragment ? 'import androidx.fragment.app.FragmentActivity' : 'import androidx.activity.ComponentActivity')
    .replaceAll('{{ADS_META}}', ads.enabled ? adsMeta(!ads.testMode && ads.appId ? ads.appId : adsTestAppId) : '')
    .replaceAll('{{PUSH_PLUGIN}}', pushProvider === 'firebase' ? PUSH_PLUGIN : '')
    .replaceAll('{{PUSH_DEPENDENCY}}', pushProvider === 'firebase' ? PUSH_DEPENDENCY : pushProvider === 'onesignal' ? ONESIGNAL_DEPENDENCY : '')
    .replaceAll('{{PUSH_SERVICE}}', pushProvider === 'firebase' ? PUSH_SERVICE : pushProvider === 'onesignal' ? ONESIGNAL_SERVICE : '')
    .replaceAll('{{ONESIGNAL_APP_ID}}', m.push?.onesignalAppId || '')
    .replaceAll('{{PERMISSIONS}}', manifestLines(permissions).join('\n'))
    .replaceAll('{{PACKAGE}}', pkg)
    .replaceAll('{{PROJECT_NAME}}', 'app')
    .replaceAll('{{APP_NAME}}', name)
    .replaceAll('{{APP_LABEL}}', xml(name));
const tmpl = (rel) => {
  const text = read(path.join(T, rel));
  if (!text.trim()) fail(`Template ${rel} is empty.`);
  return fill(text);
};

// ---- Gradle project -----------------------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true });
write('settings.gradle.kts', tmpl('settings.gradle.kts.tmpl'));
write('build.gradle.kts', tmpl('build.gradle.kts.tmpl'));
write(
  'app/build.gradle.kts',
  tmpl('app-build.gradle.kts.tmpl')
    .replaceAll('{{SIGNING}}', SIGNING)
    .replace(/versionCode = \d+/, `versionCode = ${versionCode}`)
    .replace(/versionName = "[^"]*"/, `versionName = "${versionName}"`),
);
copy(path.join(T, 'gradle.properties'), 'gradle.properties');
copy(path.join(T, 'gradle-wrapper.properties'), 'gradle/wrapper/gradle-wrapper.properties');
copy(path.join(T, 'gradle-wrapper.jar'), 'gradle/wrapper/gradle-wrapper.jar');
copy(path.join(T, 'gradlew'), 'gradlew', 0o755);

// ---- App module -----------------------------------------------------------------------------
write('app/src/main/AndroidManifest.xml', tmpl('AndroidManifest.xml.tmpl'));
copy(path.join(T, 'themes.xml'), 'app/src/main/res/values/themes.xml');
copy(path.join(T, 'themes-night.xml'), 'app/src/main/res/values-night/themes.xml');
copy(path.join(T, 'network_security_config.xml'), 'app/src/main/res/xml/network_security_config.xml');
copy(path.join(T, 'file_paths.xml'), 'app/src/main/res/xml/file_paths.xml');
const icon = path.join(JOB, 'icon.png');
copy(fs.existsSync(icon) ? icon : path.join(T, 'ic_launcher.png'), 'app/src/main/res/mipmap-xxhdpi/ic_launcher.png');

const pkgPath = pkg.replaceAll('.', '/');
for (const src of KOTLIN_SOURCES) write(`app/src/main/java/${pkgPath}/${src}`, tmpl(`kt/${src}.tmpl`));
for (const adapter of adapters(caps)) write(`app/src/main/java/${pkgPath}/${adapter}.kt`, tmpl(`kt-optional/${adapter}.kt.tmpl`));
if (pushProvider === 'firebase') {
  write(`app/src/main/java/${pkgPath}/PushService.kt`, tmpl('kt-optional/PushService.kt.tmpl'));
  const gs = path.join(JOB, 'google-services.json');
  if (fs.existsSync(gs)) copy(gs, 'app/google-services.json');
} else if (pushProvider === 'onesignal') {
  write(`app/src/main/java/${pkgPath}/PushSupport.kt`, tmpl('kt-optional/OneSignalSupport.kt.tmpl'));
}

// ---- The app itself ---------------------------------------------------------------------------
const www = path.join(JOB, 'www');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
let count = 0;
for (const file of walk(www)) {
  const rel = path.relative(www, file);
  // Builder bookkeeping never ships.
  if (rel.split(path.sep).some((s) => s.startsWith('.')) || rel === 'storage.json') continue;
  copy(file, `app/src/main/assets/www/${rel}`);
  count++;
}

console.log(`Prepared ${name} (${pkg} ${versionName}/${versionCode}): ${count} app files, capabilities [${caps.join(', ') || 'none'}], push ${pushProvider || 'off'}.`);
