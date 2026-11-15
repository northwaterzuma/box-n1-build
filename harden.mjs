import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const baseline = JSON.parse(fs.readFileSync(path.join(here, 'baseline.json'), 'utf8'));
export const gitBlobHash = text => crypto.createHash('sha1')
  .update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');

export function replaceOnce(text, before, after) {
  const start = text.indexOf(before);
  if (start < 0 || text.indexOf(before, start + before.length) >= 0) {
    throw new Error(`Expected one occurrence: ${before.slice(0, 90)}`);
  }
  return text.slice(0, start) + after + text.slice(start + before.length);
}

// Only used on the pinned Java snapshot. Ignore braces in strings and comments.
export function replaceMethod(text, signature, body) {
  const start = text.indexOf(signature);
  if (start < 0 || text.indexOf(signature, start + signature.length) >= 0) {
    throw new Error(`Method missing or ambiguous: ${signature}`);
  }
  const open = text.indexOf('{', start + signature.length);
  if (open < 0) throw new Error(`Method body missing: ${signature}`);
  let depth = 1;
  let state = 'code';
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (state === 'line') { if (c === '\n') state = 'code'; continue; }
    if (state === 'block') { if (c === '*' && n === '/') { state = 'code'; i++; } continue; }
    if (state === '"' || state === "'") {
      if (c === '\\') { i++; continue; }
      if (c === state) state = 'code';
      continue;
    }
    if (c === '/' && n === '/') { state = 'line'; i++; continue; }
    if (c === '/' && n === '*') { state = 'block'; i++; continue; }
    if (c === '"' || c === "'") { state = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) {
      return text.slice(0, open + 1) + '\n' + body + '\n    ' + text.slice(i);
    }
  }
  throw new Error(`Unclosed method: ${signature}`);
}

const java = 'app/src/main/java/';
const cat = java + 'com/github/catvod/';
const box = java + 'com/github/tvbox/osc/';

const secureTls = `package com.github.catvod.net;
import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import java.security.KeyStore;
import javax.net.ssl.*;

public class SSLCompat extends SSLSocketFactory {
    public static final HostnameVerifier VERIFIER = new okhttp3.OkHttpClient().hostnameVerifier();
    public static final X509TrustManager TM = systemTrustManager();
    private final SSLSocketFactory factory;
    private static X509TrustManager systemTrustManager() {
        try {
            TrustManagerFactory managers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            managers.init((KeyStore) null);
            for (TrustManager manager : managers.getTrustManagers()) {
                if (manager instanceof X509TrustManager) return (X509TrustManager) manager;
            }
            throw new IllegalStateException("System trust manager unavailable");
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    public SSLCompat() {
        try {
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, new TrustManager[]{TM}, null);
            factory = context.getSocketFactory();
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    private Socket secure(Socket socket) throws IOException {
        if (socket instanceof SSLSocket) {
            SSLSocket ssl = (SSLSocket) socket;
            java.util.ArrayList<String> allowed = new java.util.ArrayList<>();
            for (String protocol : ssl.getSupportedProtocols()) {
                if ("TLSv1.2".equals(protocol) || "TLSv1.3".equals(protocol)) allowed.add(protocol);
            }
            if (allowed.isEmpty()) { socket.close(); throw new IOException("TLS 1.2 required"); }
            ssl.setEnabledProtocols(allowed.toArray(new String[0]));
        }
        return socket;
    }
    public String[] getDefaultCipherSuites() { return factory.getDefaultCipherSuites(); }
    public String[] getSupportedCipherSuites() { return factory.getSupportedCipherSuites(); }
    public Socket createSocket() throws IOException { return secure(factory.createSocket()); }
    public Socket createSocket(Socket s, String h, int p, boolean close) throws IOException { return secure(factory.createSocket(s,h,p,close)); }
    public Socket createSocket(String h, int p) throws IOException { return secure(factory.createSocket(h,p)); }
    public Socket createSocket(String h, int p, InetAddress l, int lp) throws IOException { return secure(factory.createSocket(h,p,l,lp)); }
    public Socket createSocket(InetAddress h, int p) throws IOException { return secure(factory.createSocket(h,p)); }
    public Socket createSocket(InetAddress h, int p, InetAddress l, int lp) throws IOException { return secure(factory.createSocket(h,p,l,lp)); }
}
`;

const httpsInterceptor = `package com.github.tvbox.osc.util;
import java.io.IOException;
import okhttp3.Interceptor;
import okhttp3.Response;
public final class HttpsOnlyInterceptor implements Interceptor {
    @Override public Response intercept(Chain chain) throws IOException {
        if (!chain.request().url().isHttps()) throw new IOException("This build requires HTTPS");
        return chain.proceed(chain.request());
    }
}
`;

const jarStub = `package com.github.catvod.crawler;
import java.util.*;
import org.json.JSONObject;
public class JarLoader {
    public boolean load(String cache) { return false; }
    public void clear() { }
    public Spider getSpider(String key, String cls, String ext, String jar) { return new SpiderNull(); }
    public JSONObject jsonExt(String key, LinkedHashMap<String,String> jxs, String url) { return new JSONObject(); }
    public JSONObject jsonExtMix(String flag, String key, String name, LinkedHashMap<String,HashMap<String,String>> jxs, String url) { return new JSONObject(); }
    public Object[] proxyInvoke(Map<String,String> params) { return null; }
}
`;
const jsStub = `package com.github.catvod.crawler;
import java.util.Map;
public class JsLoader {
    public static void destroy() { }
    public void clear() { }
    public static void stopAll() { }
    public Spider getSpider(String key, String api, String ext, String jar) { return new SpiderNull(); }
    public Object[] proxyInvoke(Map<String,String> params) { return null; }
}
`;
const controlStub = `package com.github.tvbox.osc.server;
import android.content.Context;
public class ControlManager {
    private static final ControlManager instance = new ControlManager();
    public static Context mContext;
    public static ControlManager get() { return instance; }
    public static void init(Context context) { mContext = context.getApplicationContext(); }
    public String getAddress(boolean local) { return ""; }
    public void startServer() { }
    public void stopServer() { }
}
`;
const xwalkDialog = `package com.github.tvbox.osc.ui.dialog;
import android.content.Context;
import android.widget.TextView;
import com.github.tvbox.osc.R;
public class XWalkInitDialog extends BaseDialog {
    public XWalkInitDialog(Context context) {
        super(context);
        setContentView(R.layout.dialog_xwalk);
        TextView tip = findViewById(R.id.downXWalkArch);
        tip.setText("此版本已关闭网页解析");
        findViewById(R.id.downXWalk).setEnabled(false);
        setCancelable(true);
    }
    public XWalkInitDialog setOnListener(OnListener listener) { return this; }
    public interface OnListener { void onchange(); }
}
`;

export function transform(file, source) {
  let s = source;
  if (file === cat + 'net/SSLCompat.java') return secureTls;
  if (file === cat + 'crawler/JarLoader.java') return jarStub;
  if (file === cat + 'crawler/JsLoader.java') return jsStub;
  if (file === box + 'server/ControlManager.java') return controlStub;
  if (file === box + 'ui/dialog/XWalkInitDialog.java') return xwalkDialog;
  if (file === box + 'util/XWalkUtils.java') return null;
  if (file.startsWith(box + 'util/js/')) return null;
  if (file === 'settings.gradle') {
    return s.replace("include ':pyramid'", '').replace("include ':quickjs'", '');
  }
  if (file === 'build.gradle') {
    s = s.replace(/^.*maven\.aliyun\.com.*\n/gm, '');
    s = s.replace(/^.*chaquo.*\n/gm, '');
    s = replaceOnce(s, 'allprojects {\n    repositories {', `allprojects {
    repositories {
        maven {
            url 'https://maven.aliyun.com/repository/releases'
            content { includeGroupByRegex 'com\\\\.aliyun.*'; includeGroupByRegex 'com\\\\.alivc.*' }
        }
        maven {
            url 'https://maven.aliyun.com/repository/public'
            content {
                includeGroup 'com.kingja.loadsir'
                includeGroup 'me.jessyan'
                includeGroup 'com.lzy.net'
                includeGroup 'com.owen'
                includeGroup 'com.github.ctiao'
            }
        }`);
  }
  if (file === 'app/build.gradle') {
    for (const [before, after] of [
      ['com.squareup.okhttp3:okhttp:3.12.11', 'com.squareup.okhttp3:okhttp:4.12.0'],
      ['com.squareup.okio:okio:3.3.0', 'com.squareup.okio:okio:3.6.0'],
      ['com.thoughtworks.xstream:xstream:1.4.20', 'com.thoughtworks.xstream:xstream:1.4.21'],
      ['commons-io:commons-io:2.13.0', 'commons-io:commons-io:2.14.0'],
      ['org.jsoup:jsoup:1.16.1', 'org.jsoup:jsoup:1.23.2']
    ]) s = replaceOnce(s, before, after);
    s = replaceOnce(s, '    constraints {', `    constraints {
        implementation('com.google.guava:guava:33.7.2-android') { because('GHSA-xxph-c9ww-hj94') }
        implementation('org.apache.commons:commons-lang3:3.18.0') { because('GHSA-j288-q9x7-2f5v') }`);
    s = replaceOnce(s, "applicationId 'com.github.tvbox.osc.tk'", "applicationId 'com.github.tvbox.osc.n1strict'");
    s = replaceOnce(s, "versionName \"1.0.\".concat(buildTime())", 'versionName "N1-strict-258a5fe"');
    s = replaceOnce(s, 'release {\n            minifyEnabled true', 'release {\n            debuggable false\n            minifyEnabled true');
    s = replaceOnce(s, 'compileSdk 34', 'compileSdk 34\n    buildToolsVersion "34.0.0"');
    s = replaceMethod(s, '        python ', '');
    // Remove the empty flavor, rather than create a second build mode.
    s = s.replace(/\s*python \{\s*\}\s*/, '\n');
    s = replaceOnce(s, 'minSdkVersion 21', 'minSdkVersion 24');
    s = s.replace(/^.*pythonImplementation.*\n/gm, '');
    s = s.replace(/^.*implementation project\(path: ':quickjs'\).*\n/gm, '');
    s = replaceOnce(s, 'api fileTree(dir: "libs", include: [\'*.jar\', \'*.aar\'])', 'api fileTree(dir: "libs", include: [\'*.jar\', \'*.aar\'], exclude: [\'xwalk_shared_library-23.53.589.4.aar\'])');
  }
  if (file === 'app/src/main/AndroidManifest.xml') {
    for (const permission of ['MANAGE_EXTERNAL_STORAGE','REQUEST_INSTALL_PACKAGES','REQUEST_DELETE_PACKAGES','QUERY_ALL_PACKAGES']) {
      const declaration = new RegExp('<uses-permission\\s+android:name="android\\.permission\\.' + permission + '"[^>]*\\/>', 'g');
      if ([...s.matchAll(declaration)].length !== 1) throw new Error(`Permission declaration changed: ${permission}`);
      s = s.replace(declaration, '');
    }
    s = replaceOnce(s, 'android:allowBackup="true"', 'android:allowBackup="false"\n        tools:replace="android:allowBackup,android:usesCleartextTraffic,android:networkSecurityConfig"');
    s = replaceOnce(s, 'android:usesCleartextTraffic="true"', 'android:usesCleartextTraffic="false"');
    s = s.replace(/(<receiver[^>]*android:exported=)"true"/g, '$1"false"');
    s = s.replace(/\s*<meta-data\s+android:name="xwalk_[^"]+"[^>]*\/>/g, '');
  }
  if (file === 'app/src/main/res/xml/network_security_config.xml') return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config><base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config></network-security-config>\n`;
  if (file === 'app/src/main/res/xml/file_paths.xml') return `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android"><cache-path name="shared_cache" path="shared/" /><files-path name="shared_files" path="shared/" /></paths>\n`;
  if (file === box + 'util/OkGoHelper.java' || file === cat + 'net/OkHttp.java') {
    s = s.replaceAll('new OkHttpClient.Builder()', 'new OkHttpClient.Builder().addInterceptor(new com.github.tvbox.osc.util.HttpsOnlyInterceptor()).addNetworkInterceptor(new com.github.tvbox.osc.util.HttpsOnlyInterceptor()).followSslRedirects(false)');
    s = s.replaceAll('HttpsUtils.UnSafeHostnameVerifier', 'SSLCompat.VERIFIER');
    s = s.replace('import okhttp3.internal.Util;\n', '').replace('import okhttp3.internal.Version;\n', '');
    s = s.replace('Version.userAgent()', '"BoxN1/1"');
    s = s.replaceAll('.followSslRedirects(true)', '.followSslRedirects(false)');
    s = s.replace('return Util.immutableList(RESTRICTED_TLS, MODERN_TLS, COMPATIBLE_TLS, CLEARTEXT);', 'return java.util.Collections.singletonList(MODERN_TLS);');
  }
  if (file === java + 'okhttp3/dnsoverhttps/DnsOverHttps.java') {
    s = s.replace('import okhttp3.internal.platform.Platform;\n', '');
    s = s.replace('import okhttp3.internal.publicsuffix.PublicSuffixDatabase;\n', '');
    s = replaceOnce(s, 'Platform.get().log(Platform.WARN, "Incorrect protocol: " + response.protocol(), null);', 'android.util.Log.w("DnsOverHttps", "Incorrect protocol: " + response.protocol());');
    s = replaceMethod(s, 'static boolean isPrivateHost(String host)', `        try {
            return !com.google.common.net.InternetDomainName.from(host).isUnderPublicSuffix();
        } catch (IllegalArgumentException invalidHost) { return true; }`);
  }
  if (file === box + 'util/urlhttp/SSLSocketFactoryCompat.java') {
    const begin = s.indexOf('    //定义一个信任所有证书的TrustManager');
    if (begin < 0) throw new Error('Trust manager marker changed');
    s = s.slice(0, begin) + '    public static final X509TrustManager trustAllCert = com.github.catvod.net.SSLCompat.TM;\n}\n';
    s = s.replace('if (!protocol.toUpperCase().contains("SSL"))', 'if ("TLSv1.2".equals(protocol) || "TLSv1.3".equals(protocol))');
  }
  if (file === box + 'api/ApiConfig.java') {
    s = replaceMethod(s, 'public void loadJar(boolean useCache, String spider, LoadConfigCallback callback)', '        callback.success();');
    s = replaceMethod(s, 'public Spider getCSP(SourceBean sourceBean)', '        return new com.github.catvod.crawler.SpiderNull();');
    s = replaceMethod(s, 'public Spider getPyCSP(String url)', '        return new com.github.catvod.crawler.SpiderNull();');
    s = replaceMethod(s, 'public Object[] proxyLocal(Map<String,String> param)', '        return null;');
    s = replaceOnce(s, 'spider = DefaultConfig.safeJsonString(infoJson, "spider", "");', 'spider = ""; // Third-party code plugins are disabled.');
  }
  if (file === box + 'base/App.java') {
    s = s.replace('import com.whl.quickjs.android.QuickJSLoader;\n', '');
    s = replaceOnce(s, 'QuickJSLoader.init();', '// Script runtime disabled.');
    s = replaceMethod(s, 'public static P2PClass getp2p()', '        return null;');
    s = replaceMethod(s, 'public static void startWebserver()', '        // Network control server disabled.');
    s = s.replace('putDefault(HawkConfig.PLAY_TYPE, 1)', 'putDefault(HawkConfig.PLAY_TYPE, 2)');
    s = s.replace('putDefault(HawkConfig.HOME_REC, 1)', 'putDefault(HawkConfig.HOME_REC, 2)');
  }
  if (file === box + 'server/RemoteServer.java') {
    s = replaceMethod(s, 'public void start(int timeout, boolean daemon) throws IOException', '        throw new IOException("Remote server disabled in this build");');
    s = replaceOnce(s, 'super(port);', 'super("127.0.0.1", port);');
  }
  if (file === box + 'ui/activity/PlayActivity.java') {
    s = replaceOnce(s, 'void playUrl(String url, HashMap<String, String> headers) {', `void playUrl(String url, HashMap<String, String> headers) {
        android.net.Uri candidate = url == null ? null : android.net.Uri.parse(url);
        if (candidate == null || !"https".equalsIgnoreCase(candidate.getScheme()) || candidate.getHost() == null) {
            setTip("此版本仅允许 HTTPS 直连源", true, true);
            return;
        }`);
    s = replaceOnce(s, 'int playerType = mVodPlayerCfg.getInt("pl");', 'int playerType = 2; // External players are disabled.');
    const tail = s.indexOf('    // webview\n');
    if (tail < 0) throw new Error('Web parser marker changed');
    s = s.slice(0, tail) + `    private LinkedList<String> loadFoundVideoUrls = new LinkedList<>();
    private HashMap<String, HashMap<String,String>> loadFoundVideoUrlsHeader = new HashMap<>();
    private final AtomicInteger loadFoundCount = new AtomicInteger(0);
    void loadWebView(String url) {
        runOnUiThread(() -> Toast.makeText(mContext, "此版本已关闭网页解析，请使用 HTTPS 直连源", Toast.LENGTH_LONG).show());
    }
    void loadUrl(String url) { loadWebView(url); }
    void stopLoadWebView(boolean destroy) { }
}
`;
    s = s.replace(/^import (org\.xwalk\.[^;]+|com\.github\.tvbox\.osc\.util\.XWalkUtils);\n/gm, '');
    s = s.replace(/^import android\.(webkit\.[^;]+|net\.http\.SslError);\n/gm, '');
  }
  if (file === box + 'util/PlayerHelper.java') {
    s = replaceOnce(s, 'if (forcePlayerType >= 0) playerType = forcePlayerType;', 'playerType = 2; // Only the HTTPS-enforced Exo path is enabled.');
    s = replaceOnce(s, 'int playType = Hawk.get(HawkConfig.PLAY_TYPE, 0);', 'int playType = 2;');
    s = replaceMethod(s, 'public static void init()', '        // Do not activate bundled native network players.');
    s = replaceMethod(s, 'public static String getPlayerName(int playType)', '        return "Exo（安全版）";');
  }
  if (file === box + 'util/HawkUtils.java') {
    s = replaceMethod(s, 'public static DefaultRenderersFactory createExoRendererActualValue(Context context)', '        return new DefaultRenderersFactory(context);');
    s = replaceMethod(s, 'public static int getExoRendererModeActualValue()', '        return DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF;');
  }
  if (file === box + 'util/thunder/Thunder.java') {
    for (const [signature,body] of [
      ['private static void init(Context context)', ''],
      ['public static void stop(Boolean bool)', ''],
      ['public static void parse(Context context, Movie.Video.UrlBean urlBean, ThunderCallback callback)', '        callback.status(-1, "此版本已关闭下载和 P2P 播放");'],
      ['public static boolean play(String url, ThunderCallback callback)', '        return false;'],
      ['public static boolean isSupportUrl(String url)', '        return false;'],
      ['public static boolean isFtp(String url)', '        return false;'],
      ['public static boolean isNetworkDownloadTask(String url)', '        return false;'],
      ['public static void stopTask()', ''],
      ['public static XLTaskInfo getTaskInfo()', '        return null;'],
      ['public static String getPlayUrl()', '        return "";']
    ]) s = replaceMethod(s, signature, body);
  }
  if (file === java + 'xyz/doikki/videoplayer/exo/ExoMediaSourceHelper.java') {
    s = replaceOnce(s, 'Uri contentUri = Uri.parse(uri);', 'Uri contentUri = Uri.parse(uri);\n        if (!"https".equalsIgnoreCase(contentUri.getScheme()) || contentUri.getHost() == null) throw new IllegalArgumentException("HTTPS media source required");');
    s = replaceMethod(s, 'private DataSource.Factory getDataSourceFactory()', '        return getHttpDataSourceFactory();');
  }
  if (file === java + 'xyz/doikki/videoplayer/player/BaseVideoView.java') {
    s = replaceOnce(s, 'mMediaPlayer = mPlayerFactory.createPlayer(getContext());', 'mMediaPlayer = (P) new com.github.tvbox.osc.player.EXOmPlayer(getContext());');
    s = replaceMethod(s, 'public void setUrl(String url, Map<String, String> headers)', `        mAssetFileDescriptor = null;
        android.net.Uri parsed = url == null ? null : android.net.Uri.parse(url);
        if (parsed == null || !"https".equalsIgnoreCase(parsed.getScheme()) || parsed.getHost() == null) {
            mUrl = "";
            mHeaders = null;
            onError(-1, "此版本仅允许 HTTPS 直连源");
            return;
        }
        mUrl = url;
        mHeaders = headers;`);
  }
  if (s === source) throw new Error(`No change for expected patch: ${file}`);
  return s;
}

export function createPlan(inputs) {
  const changes = new Map();
  for (const [file, hash] of Object.entries(baseline.files)) {
    const source = inputs.get(file);
    if (typeof source !== 'string' || gitBlobHash(source) !== hash) throw new Error(`Snapshot mismatch: ${file}`);
    changes.set(file, transform(file, source));
  }
  changes.set(box + 'util/HttpsOnlyInterceptor.java', httpsInterceptor);
  return changes;
}

if (typeof process !== 'undefined' && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || 'Box-N1');
  const inputs = new Map(Object.keys(baseline.files).map(file => [file, fs.readFileSync(path.join(root,file),'utf8')]));
  const changes = createPlan(inputs); // Validate every input before writing anything.
  for (const [file, hash] of Object.entries(baseline.delete_files || {})) {
    if (gitBlobHash(fs.readFileSync(path.join(root,file),'utf8')) !== hash) throw new Error(`Snapshot mismatch: ${file}`);
    changes.set(file, null);
  }
  for (const [file, text] of changes) {
    const target = path.join(root,file);
    if (text === null) fs.unlinkSync(target);
    else { fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,text); }
  }
  console.log(`Applied ${changes.size} pinned source changes; Android compilation remains required.`);
}
