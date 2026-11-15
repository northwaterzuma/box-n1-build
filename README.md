# Box N1 严格候选版

本仓库提供固定上游快照的严格版补丁和云端构建流程。用户已选择安全优先，接受部分源与功能不可用，并批准创建本仓库和执行首轮云端检查；在取得真实构建记录前，不能视为已编译成功或通过全部安全检查。

固定上游：<https://github.com/takagen99/Box/tree/258a5fef61578869ae905ca230bdde9e99fc19a8>。本工具只对该快照和记录在 `baseline.json` 中的原始文件生效；匹配失败即停止写入。上游许可证为 AGPL-3.0，发布源码和 APK 时保留许可证、出处和修改说明。

准备的修改：

- 关闭 JAR/JS/Python 源插件，移除 QuickJS 模块和脚本实现；关闭网页解析，排除旧 Crosswalk AAR；关闭 P2P/下载引擎与网络控制服务。
- 使用系统证书与正常主机名校验，关闭旧的信任全部证书实现；主请求、重定向和媒体分片使用 HTTPS 检查。禁止 RTMP、RTSP、HTTP 和网页播放路径；外部播放器不启用。
- 固定使用 Exo 播放路径，关闭原生网络播放器和扩展解码器的启用入口。上游部分原生库与厂商依赖仍包含在包中，需单独审查，不能视为已从源码重建或已消除漏洞。
- 禁用备份、安装/卸载权限、全盘管理权限、包清单查询权限和外部广播入口；限制 FileProvider 路径。保留现有 READ/WRITE_EXTERNAL_STORAGE 权限供现有文件功能使用，合并后的其他权限超出白名单即阻止交付。
- 应用 ID 改为 `com.github.tvbox.osc.n1strict`；最低 Android 版本为 7.0，以便系统网络安全配置能够生效。

构建工作流位于 `.github/workflows/build.yml`。仅手动触发；源码、Actions 和 Gradle 版本固定；不会在本机安装 Java、Android SDK 或 Gradle。云端使用预装 JDK 17、Android SDK 34，官方 Gradle 7.6.4；这是兼容现有上游的起点，并非声称工具链和所有依赖都是最新版。

工作流先生成 Maven 依赖清单并查询 OSV。命中已知公告或查询不完整时停止，待查明并修复后重跑。未命中不构成安全保证；本地 JAR/AAR 和预编译原生库不在该 Maven 查询的完整覆盖范围。

首次解析依赖时生成 SHA-256 校验基线，后续编译启用严格校验。首次基线是下载内容记录，不能证明第一次下载可信。编译完成后检查双 ABI、每个 ELF 的实际架构、原生库哈希、实际合并权限和网络策略。任何检查失败时不上传可交付 APK。

首次构建选择 `sign=false`，只能得到未签名候选 APK。正式签名需要用户自行在 GitHub 仓库 Secrets 中配置以下四项；不要在聊天中提供这些值：

- `BOX_KEYSTORE_B64`
- `BOX_KEYSTORE_PASSWORD`
- `BOX_KEY_ALIAS`
- `BOX_KEY_PASSWORD`

配置后选择 `sign=true`。签名在独立任务中进行，不执行上游构建代码；密钥仅传给签名步骤，不打印或上传密钥。必须由用户保管稳定密钥备份；当前材料没有生成或读取任何用户密钥。不同签名不能直接覆盖更新现有应用。

本地已通过 4 项 Node 测试，且在内存中验证了当前 25 个固定上游文本文件的原始 Git blob 哈希和补丁匹配。首轮云端运行的 4 项 Node 和 11 项 Python 测试全部通过，最初的 41 项固定源码改动成功应用；本机未安装任何新软件。

首轮运行在依赖解析处停止：LoadSir、AutoSize、OkGo、TV RecyclerView 和 DanmakuFlameMaster 的既有版本不在已查询的原始仓库中。为这五个明确的 Maven group 限定使用原上游采用的阿里公开镜像回退，其他依赖不使用该公开镜像。镜像提供的二进制仍需记录哈希并纳入后续审查；这不是原始源码可复现性的证明。Android 编译、依赖公告结果、正式签名和 N1 实机行为尚未通过验证。

第二轮已完成依赖解析，OSV 命中 7 个依赖版本涉及的 8 条公告，工作流因此停止，没有输出 APK。当前补丁按公告的修复范围升级以下依赖；仍须重新解析、复查公告和进行 Android 编译，不能提前视为验证通过。下面列出此次更新的确切原始下载来源；由同一条已批准的 Gradle 构建命令解析下载，不执行下载文件中的安装脚本。

| 依赖 | 准备升级到 | Maven Central 原始文件 |
| --- | --- | --- |
| Guava | 33.7.2-android | <https://repo.maven.apache.org/maven2/com/google/guava/guava/33.7.2-android/guava-33.7.2-android.jar> |
| OkHttp | 4.12.0 | <https://repo.maven.apache.org/maven2/com/squareup/okhttp3/okhttp/4.12.0/okhttp-4.12.0.jar> |
| Okio JVM | 3.6.0 | <https://repo.maven.apache.org/maven2/com/squareup/okio/okio-jvm/3.6.0/okio-jvm-3.6.0.jar> |
| XStream | 1.4.21 | <https://repo.maven.apache.org/maven2/com/thoughtworks/xstream/xstream/1.4.21/xstream-1.4.21.jar> |
| Commons IO | 2.14.0 | <https://repo.maven.apache.org/maven2/commons-io/commons-io/2.14.0/commons-io-2.14.0.jar> |
| Commons Lang | 3.18.0 | <https://repo.maven.apache.org/maven2/org/apache/commons/commons-lang3/3.18.0/commons-lang3-3.18.0.jar> |
| jsoup | 1.23.2 | <https://repo.maven.apache.org/maven2/org/jsoup/jsoup/1.23.2/jsoup-1.23.2.jar> |

证据：[Guava 官方修复发布](https://github.com/google/guava/releases/tag/v33.7.2)、[jsoup 官方修复发布](https://github.com/jhy/jsoup/releases/tag/jsoup-1.23.2)，以及 GitHub Advisory Database 的 GHSA-xxph-c9ww-hj94、GHSA-3cqm-mf7h-prrj、GHSA-w33c-445m-f8w7、GHSA-hfq9-hggm-c56q、GHSA-78wr-2p64-hpwj、GHSA-j288-q9x7-2f5v、GHSA-65r4-943x-97jj、GHSA-pmhh-3w7g-xqp8。公告说明受影响的条件；命中版本不等于已证实本应用可被利用，本流程仍选择修复而不忽略这些命中。

执行命令保持为工作流中的 `gradle -p Box-N1 --no-daemon --console=plain --dependency-verification strict :app:assembleArm64GenericNormalRelease :app:assembleArmeabiGenericNormalRelease`。首次审计解析仍先生成校验基线并查询 OSV。为避免依赖 OkHttp 私有接口，同时调整了自带 DNS 客户端的日志及域名分类调用；需要编译和运行验证。

直播回看需要合法授权且可用的 HTTPS 回看源和节目单。关闭插件与明文源后，某些现有配置将不能使用。该候选版无法修复 Android 固件、系统 WebView/编解码器或内核漏洞，也不能承诺不存在未知漏洞。

完整来源、网络域名和执行命令见 `SECURITY_REVIEW.md`。本任务只进行仓库建设和云端检查，不向 N1 安装或修改固件。
