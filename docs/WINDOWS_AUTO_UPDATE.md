# Windows Chrome 本地自动更新（GitHub Releases）

## 适用范围

- Windows 10/11，Windows PowerShell 5.1，Chrome/Edge **开发者模式加载的解压扩展**。
- 无需 Chrome 商店开发者账号，不会执行 GitHub 上的远程 JavaScript 代码；只下载完整扩展发行包。
- 公开固定仓库 `Laity000/confluence-markdown-sync`；需要从 Windows 访问 GitHub Releases。公司网络若阻止 GitHub，将无法在线更新。
- 首次从 v1.3 等老版本迁移需要**手动重新加载一次**，让扩展获得新版 `alarms` 权限与后台逻辑。其后只要工作台关闭，可自动重载。

## 只需配置一次

1. 从 GitHub 仓库的 `Code → Download ZIP` 下载源码，解压，例如 `D:\Downloads\confluence-markdown-sync`。也可用 Git 克隆。
2. 打开 PowerShell，运行（路径按自己的电脑修改）：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Downloads\confluence-markdown-sync\windows\Install-ConfluenceSyncUpdater.ps1" -ExtensionPath "D:\Tools\ConfluenceSync"
   ```

   如果你已经用 `D:\Tools\ConfluenceSync` 加载了插件，**务必指向同一个含 `manifest.json` 的扩展根目录**；不要指向它的上级目录。

3. 脚本会下载 GitHub 最新 Release，验证 SHA256，自动更新扩展目录，并为当前用户创建一个“登录时 + 每小时”的计划任务 `ConfluenceMarkdownSync-AutoUpdate`。无需管理员权限，企业安全策略可能阻止计划任务创建。
4. 如果之前没有加载插件：进入 `chrome://extensions`，打开开发者模式，点击“加载已解压的扩展程序”，**选择 `D:\Tools\ConfluenceSync`**，完成一次安装。如果原来加载的是 v1.3：到同一页面**点一次重新加载**。
5. 后续发布 v1.4.1、v1.5.0 等版本，只要 GitHub Actions 构建并发布了 Release，任务会自动下载；后台服务发现 `update-status.json` 新版本标记后，若没有打开编辑器，自动重载。

## 自动更新机制

```text
GitHub main: manifest.json 版本提高
  → GitHub Actions: 测试、打 ZIP、SHA256SUMS.txt、发布正式 Release
  → Windows Scheduled Task（登录时+每小时）
  → HTTPS 下载、SHA256 核验、ZIP 允许列表校验、版本核对
  → staging 校验通过，备份本地旧文件，复制新版
  → 最后写 update-status.json（version、hash、时间）
  → Chrome service worker 每 2 分钟读取扩展自身的标记
  → 未打开 editor.html 工作台时调用 chrome.runtime.reload()
```

Chrome 在关闭、休眠或工作台打开时无法即时更新。**Windows 计划任务下载与本地替换可以后台进行，但只有 Chrome 打开且编辑器关闭时才能触发重载。** 不会强制关闭 Chrome，也不会中止 Confluence 的更新流程。保持编辑器页面打开时，新版会延后启用到关闭页面后。

## 检查/故障排除

- 计划任务：Windows “任务计划程序”中查看 `ConfluenceMarkdownSync-AutoUpdate`。
- 日志：`%LOCALAPPDATA%\ConfluenceMarkdownSync\updater\updater.log`，这里不会记录密码或 Cookie。
- 本地状态：`%LOCALAPPDATA%\ConfluenceMarkdownSync\updater\config.json`，记录已加载扩展文件夹路径，没有登录凭证。
- 手动触发检查：

  ```powershell
  powershell.exe -NoProfile -File "$env:LOCALAPPDATA\ConfluenceMarkdownSync\updater\Update-ConfluenceSync.ps1" -CheckOnly
  ```

  删除 `-CheckOnly` 可以立即应用更新。
- Chrome 访问 `chrome://extensions`，核实版本；如果遇到延迟，关闭“Markdown → Confluence”工作台等待约 2 分钟，或手动点击“重新加载”。
- 关闭更新：在 PowerShell 执行 `windows\Uninstall-ConfluenceSyncUpdater.ps1`，只删除计划任务，保留你的扩展和配置。
- 如果安装失败，查看日志。磁盘替换失败会尝试回滚旧文件；如遭系统断电等无法保证原子性，可以重新执行更新脚本。

## 安全和限制

- 校验发行 ZIP 的 SHA256SUMS 与 GitHub release asset digest（若 GitHub 提供）。这保证下载完整性，但**不是独立签名**：信任前提是你信任仓库所有者及 GitHub Releases。请启用 GitHub 2FA，保护分支及 Actions 权限。
- 下载只允许 HTTPS GitHub 官方 Releases 域名；归档成员必须严格匹配 11 个已批准的扩展运行文件，禁止解压其它路径或额外脚本。
- 为兼容 v1.3 的用户，安装脚本会覆盖同名扩展运行文件，请先确认目录正确。不会修改 Confluence 的数据、登录状态、浏览器配置文件，也不会直接操作 Chrome 的调试端口。
- Windows 每小时检查；Chrome 扩展每 2 分钟检查本地标记，因此不是实时毫秒更新。用户开启编辑器时会推迟热重载，保护未保存 Markdown 和正在进行的同步。
- 本项目是面向个人或授权企业环境的开发模式工具；**企业 Chrome 策略可能禁止开发者模式/计划任务**，这种情况下请咨询 IT，而不是绕过限制。
- 若以后加入新的扩展运行文件，需要同时更新脚本内的 `AllowedFiles` 白名单并重新安装 Windows 更新器。
