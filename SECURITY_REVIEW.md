# Box N1 云端构建审核

状态：已完成公开资料和关键源码的初步检查，并准备严格版补丁与工作流；24 个原始文本文件的 Git blob 哈希及补丁匹配已核验，4 项 Node 离线测试通过。另有 11 项 Python 检查测试等待云端运行（本机未安装解释器，未安装任何新软件）。用户已批准列明的页面操作、来源、下载域名与云端命令；独立仓库已创建，尚未下载 APK、执行上游代码或触发云端构建。本文不构成安全认证。

可审阅材料：[构建说明](README.md)，工作流为该目录的 `.github/workflows/build.yml`。正式签名材料尚未由用户配置，首次构建只生成未签名候选版。

## 已核实

- GitHub 连接账号：`northwaterzuma`。当前连接提供仓库文件操作，但没有创建仓库的专用工具；本机 GitHub CLI 返回未认证。无需在聊天中提供 Token、密码或签名密钥。
- 上游：<https://github.com/takagen99/Box>，默认分支 `main`；本次固定快照为 `258a5fef61578869ae905ca230bdde9e99fc19a8`，提交时间 2026-02-27 03:16:18 UTC。
- 上游最新 Release 仍是 2022-07-09 发布的 `v1.0.0-alpha`：<https://github.com/takagen99/Box/releases/tag/v1.0.0-alpha>。Release 日期不能代表当前源码日期。
- 当前源码的 `app/build.gradle` 明确区分 `arm64-v8a` 与 `armeabi-v7a`，`app` 与 `quickjs` 的原生库目录均包含这两个 ABI。打包后仍须逐个核验 APK，不能只看目录或文件名。
- 社区仓库确有 2026-02-16 发布记录：<https://github.com/xx025/TvBox-build/releases/tag/v2026.02.16.151331>。发布说明指向 `xx025/Box`，本次未下载其中的 APK，不能确认其实际库内容或与上游完全一致。拟构建版本直接使用上游源码，不采用该 APK。

## 关键问题

以下路径均相对于上述固定源码快照。

| 证据 | 问题 | 处理方向 |
| --- | --- | --- |
| `app/src/main/java/com/github/catvod/net/SSLCompat.java:23`、`:113` 起 | 主机名校验直接返回 true，证书校验方法为空 | 使用系统信任链与正常主机名校验，证书异常时拒绝连接 |
| `app/src/main/java/com/github/tvbox/osc/util/OkGoHelper.java:203` | 使用 `UnSafeHostnameVerifier` | 与播放器、DNS、配置下载等客户端一起检查，避免只修一个入口 |
| `app/src/main/java/com/github/tvbox/osc/util/urlhttp/SSLSocketFactoryCompat.java` | 另有接受所有证书的 TrustManager | 检查调用并移除绕过路径 |
| `app/src/main/AndroidManifest.xml` | 允许备份、安装/卸载软件权限、广泛文件访问、对外导出的接收器、允许 HTTP | 逐项核对调用后减少权限；保留启动入口；限制其他外部入口 |
| `app/src/main/java/com/github/tvbox/osc/server/RemoteServer.java:69`、`App.java:191` 起 | HTTP 服务需要检查监听地址、鉴权、文件访问和上传处理 | 优先限制为本机内部代理；保留手机遥控需另做鉴权 |
| `app/libs/xwalk_shared_library-23.53.589.4.aar`、Manifest 的 `xwalk_verify=disable` | 存在旧 Crosswalk 接口与运行时加载路径 | 不使用旧运行时；系统 WebView 的安全性仍取决于设备固件和 WebView 版本 |
| `app/src/main/java/com/github/catvod/crawler/JarLoader.java`、`JsLoader.java` | 配置源可以引入并执行第三方代码 | 安全优先版关闭；兼容版保留时必须明确该信任边界 |
| `app/src/main/jniLibs/`、`quickjs/src/main/jniLibs/`、本地 JAR/AAR | 预编译二进制并非本次从源码重建 | 记录哈希和来源；版本、源码对应关系或漏洞状态无法确认的部分仍须列为风险 |
| `build.gradle`、`gradle/wrapper/gradle-wrapper.properties` | 多个依赖镜像，Gradle 来自腾讯镜像且无分发校验值；工具链与部分依赖较旧 | 改用官方分发、固定版本和 Actions 提交，检查依赖解析与校验记录；不能用“构建成功”代替漏洞检查 |

缺少 arm64 库主要是兼容性问题，并非已经证实的安全漏洞。APK 也不能修复 Android 固件、内核、驱动或系统 WebView 本身的漏洞。

## 已确认的功能取舍

用户已选择安全优先：关闭第三方 JAR/JS/Python 执行和外部 HTTP 源，接受部分点播、直播与回看源不可用。准备的严格版不开放 HTTP 本机回环例外，同时关闭网页解析、P2P 和网络控制服务，限制为 Exo 的 HTTPS 播放路径。最低 Android 版本提高到 7.0，以使用系统网络安全策略。

直播回看还依赖频道源、节目单和服务端提供回看地址；重新编译不能自动让所有频道支持回看。

## 拟执行的云端流程

已新建独立仓库：`northwaterzuma/box-n1-build`，保留上游 AGPL-3.0 许可证、出处与修改说明。用户已批准通过 GitHub 页面创建仓库并运行下列云端检查；计算机操作范围仅限该仓库的创建页面及必要的 Actions 页面，不读取浏览器凭据或其他账号资料。

1. 应用已准备的严格版源码补丁；原始文件与固定快照不一致时立即停止。
2. 在 GitHub 临时 Linux 构建环境中获取固定上游快照；不在本机安装 Java、Android SDK 或 Gradle。
3. 构建权限使用最小的 `contents: read`，不向执行上游代码的步骤提供长期令牌或签名密钥；使用固定提交的 Actions，不运行自动追踪最新源码的计划任务。
4. 解析两个目标的 Maven 运行时依赖并通过 OSV 查询已知公告；有命中或查询不完整时停止，查明并修复后再构建。扫描不完整覆盖构建插件、编译器、本地 JAR/AAR 和原生库。分别构建 arm64 与 32 位 ARM 通用 Java 版本，避免误把 CPU 支持 64 位等同于 Android 用户空间支持 64 位。
5. 核验 APK 的实际 ABI、每个原生库的 ELF 架构、合并后的权限、调试标志、签名和 SHA-256；保存源码快照、修改补丁和依赖清单。
6. 关键检查不通过时停止交付。正式签名须采用用户控制的稳定密钥并与不可信构建步骤隔离；不得用仓库中的公开密钥或调试密钥冒充正式签名。
7. 构建后仍需在 N1 上验证启动、播放、遥控与有授权回看源。本次不包含安装 APK 或修改 N1 固件。

拟下载的源码 URL：<https://github.com/takagen99/Box.git>。

获取源码的等价具体命令（只在批准后执行；若由固定提交的 checkout Action 代办，也使用同一提交）：

```sh
git init Box-N1
git -C Box-N1 remote add origin https://github.com/takagen99/Box.git
git -C Box-N1 fetch --depth=1 origin 258a5fef61578869ae905ca230bdde9e99fc19a8
git -C Box-N1 checkout --detach 258a5fef61578869ae905ca230bdde9e99fc19a8
```

拟使用的官方 Gradle 分发：<https://services.gradle.org/distributions/gradle-7.6.4-bin.zip>，由官方 `gradle/actions/setup-gradle` 安装并核验；该版本与上游现有工具链配套，不能称为最新工具链。若后续升级工具链或依赖，应重新核实来源和兼容性。

构建命令（在审查过的补丁上执行）：

```sh
node kit/harden.mjs Box-N1
gradle -p Box-N1 -I "$GITHUB_WORKSPACE/kit/dependencies.gradle" --no-daemon --console=plain --write-verification-metadata sha256 :app:n1DependencyInventory
python3 kit/scan_dependencies.py out/review/dependencies.json out/review/osv-report.json
gradle -p Box-N1 --no-daemon --console=plain --dependency-verification strict :app:assembleArm64GenericNormalRelease :app:assembleArmeabiGenericNormalRelease
python3 kit/verify_apks.py out/candidates --report out/candidates/apk-report.json
```

首次依赖解析需要审核下载项并建立校验基线；后续构建应严格校验。首次生成校验哈希只能记录下载内容，不能反过来证明下载内容可信。

预期需要的网络域名及用途：

- `github.com`、`api.github.com`：源码、固定提交的 Actions、仓库和构建状态。
- `codeload.github.com`、`objects.githubusercontent.com`、`release-assets.githubusercontent.com`：GitHub 提供的源码和发布文件下载。
- `services.gradle.org`、`downloads.gradle.org`：官方 Gradle 分发与校验资料。
- `dl.google.com`、`maven.google.com`：Android SDK / Google Maven（优先使用云端预装 SDK）。
- `repo.maven.apache.org`、`repo1.maven.org`：Maven Central 依赖。
- `plugins.gradle.org`、`plugins-artifacts.gradle.org`：Gradle 插件。
- `jitpack.io`：上游指定的 GitHub 项目依赖，需要额外核对版本与构建来源。
- `storage.googleapis.com`：上游指定的 Google R8 分发。
- `maven.aliyun.com`：上游当前依赖镜像及阿里播放器来源；修改时应尽量使用原始官方仓库并审查仍需保留的下载。
- `api.osv.dev`：按已解析的 Maven 坐标查询公开漏洞公告，不发送源码或凭据。

若出现其他软件源、需要安装额外软件或需要执行未列出的远程安装命令，应先说明准确 URL 和命令再请求批准。不会使用下载脚本直接管道执行。

## 完成标准与边界

- 有可追溯的源码、补丁、构建记录和双 ABI 检查结果。
- 修复的问题有对应检查依据；尚未确认的问题明确保留，不使用“零漏洞”“所有隐患排除”等结论。
- 依赖漏洞数据库没有命中也不代表没有漏洞；未知漏洞、恶意媒体输入、第三方源和设备固件风险无法作绝对保证。
- 当前尚无构建产物，尚未运行依赖公告查询、Android 编译、APK 实际权限检查，尚未验证签名或 N1 实机兼容性。准备的测试和检查不能提前算作已通过。

