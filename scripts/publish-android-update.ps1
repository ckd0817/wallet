param([string]$Server = 'vps', [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path $PSScriptRoot -Parent
$env:JAVA_HOME = 'E:\Java\jdk-21'
$env:PATH = 'E:\Java\jdk-21\bin;' + $env:PATH
$buildToolsPath = 'E:\AndroidStudioSDK\build-tools\36.1.0'
function Assert-CommandSuccess([string]$Message) { if ($LASTEXITCODE -ne 0) { throw $Message } }
Push-Location $projectPath
try {
    if (!$SkipBuild) {
        & npm.cmd run android:sync
        Assert-CommandSuccess '网页构建失败'
        Push-Location (Join-Path $projectPath 'android')
        try { & .\gradlew.bat assembleDebug; Assert-CommandSuccess 'Debug 打包失败' }
        finally { Pop-Location }
    }
    $apkPath = Join-Path $projectPath 'android\app\build\outputs\apk\debug\app-debug.apk'
    $certificates = & (Join-Path $buildToolsPath 'apksigner.bat') verify --print-certs $apkPath
    Assert-CommandSuccess '签名校验失败'
    $digest = $certificates | Select-String '^Signer #1 certificate SHA-256 digest: (.+)$'
    if (!$digest -or $digest.Matches[0].Groups[1].Value -ne '792ecb9983686fe090a71f7c4132dece5f9fd9e8838e0c9a7bae8d5bb5dbd2ea') { throw '必须使用本机固定 Debug 签名' }
    $metadata = (& (Join-Path $buildToolsPath 'aapt.exe') dump badging $apkPath) -join "`n"
    Assert-CommandSuccess '读取安装包信息失败'
    $packageMatch = [regex]::Match($metadata, "package: name='com.smartwallet.app' versionCode='(\d+)' versionName='([^']+)'")
    if (!$packageMatch.Success -or $metadata -notmatch 'application-debuggable') { throw '必须发布 com.smartwallet.app 的 Debug APK' }
    $versionCode = $packageMatch.Groups[1].Value
    $versionName = $packageMatch.Groups[2].Value
    if ($versionName -notmatch '^[a-zA-Z0-9._-]+$') { throw '版本名只能包含字母、数字、点、下划线和连字符' }
    $uploadName = 'wallet-update-' + [guid]::NewGuid().ToString('N')
    & scp $apkPath "${Server}:/tmp/$uploadName.apk"
    Assert-CommandSuccess '上传安装包失败'
    & scp (Join-Path $projectPath 'server\deploy\publish-update.sh') "${Server}:/tmp/$uploadName.sh"
    Assert-CommandSuccess '上传发布脚本失败'
    & ssh $Server "sudo bash /tmp/$uploadName.sh /tmp/$uploadName.apk $versionCode $versionName"
    Assert-CommandSuccess '发布更新失败'
    & ssh $Server "rm -- /tmp/$uploadName.apk /tmp/$uploadName.sh"
    Assert-CommandSuccess '清理临时文件失败'
    Write-Output "已发布 Debug $versionName（$versionCode）"
} finally { Pop-Location }
