# Android Debug 更新分发

应用内更新已接入现有云服务。应用启动时检查版本，设置页提供“检查更新”；用户选择更新后，应用下载并校验安装包，再打开系统安装程序。

## 固定配置

| 项目 | 配置 |
| --- | --- |
| 构建类型 | 仅 Debug，使用 `assembleDebug` |
| 应用 ID | `com.smartwallet.app` |
| APK | `android\app\build\outputs\apk\debug\app-debug.apk` |
| JDK | `E:\Java\jdk-21` |
| Android 构建工具 | `E:\AndroidStudioSDK\build-tools\36.1.0` |
| ADB | `E:\AndroidStudioSDK\platform-tools\adb.exe` |
| 默认 SSH 主机 | 本机已配置的 `vps` |
| 版本接口 | `https://152.32.147.55:8443/api/v1/app-updates/android` |
| 服务端发布目录 | `/var/lib/wallet/releases` |

必须沿用现有 Debug keystore，不生成新签名，不构建或分发 Release APK。固定签名的 SHA-256 指纹为：

```text
792ecb9983686fe090a71f7c4132dece5f9fd9e8838e0c9a7bae8d5bb5dbd2ea
```

签名文件、数据库凭据、模型密钥、服务器主密钥和用户数据副本不得提交到 Git。

## 每次发布

以下命令在 Windows PowerShell 中执行。

1. 查询服务器已发布版本：

   ```powershell
   Set-Location E:\Project\wallet
   $latest = Invoke-RestMethod 'https://152.32.147.55:8443/api/v1/app-updates/android'
   $latest.release
   ```

   `release` 为 `null` 表示尚未发布安装包。

2. 修改 `android\app\build.gradle` 中的 `versionCode` 和 `versionName`。

   `versionCode` 必须同时大于服务器已发布版本和需要升级的客户端版本。`versionName` 保留 Debug 标识，例如 `2.2.2-debug`；发布脚本接受字母、数字、点、下划线和连字符。不得复用已经发布的版本号。

3. 完成与改动相关的检查。前端通常使用：

   ```powershell
   npx tsc --noEmit
   npx vitest run
   ```

   涉及 Android 原生逻辑时先设置 JDK，再运行相关测试：

   ```powershell
   $env:JAVA_HOME = 'E:\Java\jdk-21'
   $env:PATH = 'E:\Java\jdk-21\bin;' + $env:PATH
   Push-Location android
   try { .\gradlew.bat :app:testDebugUnitTest } finally { Pop-Location }
   ```

   任一检查失败时先修复，不继续发布。

4. 构建并发布：

   ```powershell
   .\scripts\publish-android-update.ps1
   ```

   脚本设置 JDK 21，执行 `npm run android:sync` 和 `assembleDebug`，校验应用 ID、可调试状态和固定 Debug 签名，然后通过 SSH 上传 APK，并调用服务端发布脚本。默认使用 SSH 主机 `vps`，该主机需具备部署所需的 `sudo` 权限。

   已经完成构建且确认 APK 对应当前代码时，可以跳过重复构建：

   ```powershell
   .\scripts\publish-android-update.ps1 -SkipBuild
   ```

   如需更换已配置的 SSH 主机，可使用 `-Server 主机别名`。更换分发服务器还需要同步客户端的云服务地址，不能只修改这个参数。

5. 核验发布结果：

   ```powershell
   $latest = Invoke-RestMethod 'https://152.32.147.55:8443/api/v1/app-updates/android'
   $apk = Get-Item '.\android\app\build\outputs\apk\debug\app-debug.apk'
   $hash = (Get-FileHash $apk.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
   if ($latest.release.sha256 -ne $hash -or $latest.release.size -ne $apk.Length) {
       throw '服务器发布产物与本机构建不一致'
   }
   $latest.release
   ```

   同时确认返回的 `versionCode` 和 `versionName` 与本次构建一致。在旧版本手机上打开应用，确认更新提示、下载和系统覆盖安装；安装后再次检查，应显示“已是最新版本”，原有账本和持仓应保留。

## 本机覆盖安装

发布脚本负责服务器分发，不会通过 ADB 安装到手机。项目改动影响 Android 运行结果时，仍需按 `AGENTS.md` 的要求安装到已连接、已授权的真机。

安装前读取手机当前 APK，用 `apksigner verify --print-certs` 核对现有签名与新 APK 一致；不一致时保留旧应用，先备份并验证数据，不直接卸载。签名一致后执行：

```powershell
& 'E:\AndroidStudioSDK\platform-tools\adb.exe' install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

## 服务端行为

- `server/src/appUpdates.ts` 提供公开的版本查询和安装包下载，不需要账户登录，不读取用户账本。
- `server/deploy/publish-update.sh` 计算 APK 大小和 SHA-256，先写入 `<versionCode>.apk`，再原子替换 `latest.json`。重复或更小的版本号会被拒绝。
- 旧版本安装包保留，避免中断正在进行的下载。不要在 APK 尚未完整上传时手工修改 `latest.json`。
- 客户端校验下载大小、SHA-256、应用 ID、版本号、版本名、Debug 状态和已安装应用签名。首次可能需要允许“记账”安装应用，授权返回后继续打开系统安装程序。
- APK 发布不更新服务端业务代码，也不迁移数据库。服务端代码有变动时，按 [服务端部署文档](../server/README.md) 另行备份、测试和部署。

## 首次接入和故障处理

没有更新功能的旧客户端必须先安装一次带更新功能的 Debug APK；之后即可通过应用内更新。可根据版本接口返回的 `versionCode` 获取首个安装包：

```powershell
$latest = Invoke-RestMethod 'https://152.32.147.55:8443/api/v1/app-updates/android'
"https://152.32.147.55:8443/api/v1/app-updates/android/$($latest.release.versionCode).apk"
```

| 现象 | 处理 |
| --- | --- |
| 版本号必须递增 | 查询服务器版本，递增 `versionCode`，重新构建 |
| 签名或 Debug 校验失败 | 确认使用本机原有 Debug keystore 和 `assembleDebug`，不要卸载旧应用 |
| 上传失败 | 检查 `ssh vps`、网络和部署权限，修复后重试 |
| 上传后脚本报错 | 先查询版本接口；若同一版本及 SHA-256 已发布成功，不重复发布该版本号 |
| 检查更新失败 | 检查 `/health`、版本接口、HTTPS 证书和 `wallet.service` 状态 |
| 下载或完整性校验失败 | 重试下载；确认版本清单的大小、SHA-256 与对应 APK 一致 |
| 首次无法安装 | 在系统设置允许“记账”安装应用，再返回继续安装 |
| 已发布版本有问题 | 修复后发布更大版本号；已升级客户端不会自动降级 |

旧 APK 可以保留用于排查，但不要将版本清单改为较小版本号，或通过卸载来绕过版本、签名检查。
