# Chrome Web Store 页面文案（发布前审阅）

> 草稿。正式发布前，应根据实际测试环境、产品功能与开发者联系信息核对。

**商品名**：Markdown → Confluence 内网同步

**简短描述**：将 Markdown 转换并同步至已登录的 Confluence Server/Data Center 页面，支持预览与版本冲突检查。

**详细描述**：

本扩展为面向 Confluence Server/Data Center 的 Markdown 编辑与页面同步工具。使用者在 Chrome 浏览器登录自己有权限访问的 Confluence 页面，导入或粘贴 Markdown，并填写目标页面链接（`.../pages/viewpage.action?pageId=...`）。工具在本地解析 Markdown，读取目标页面版本及 Storage 内容，预览差异后可一键更新；更新前检查版本及正文，发现并发修改则阻止覆盖。

使用者可以选择手动导出旧页面 JSON 备份。本扩展不会要求重新输入 Confluence 密码，也不会读取浏览器 Cookie 值。通过当前浏览器已有的登录会话，在被授权的 Confluence 站点执行请求。Confluence API 和账号由使用者所属企业管理。

**审核员测试说明**：

- 打开扩展页面，可以离线输入 Markdown 并使用「复制 Wiki Markup」与「下载 Wiki Markup」验证转换功能。
- 页面自动同步功能依赖用户自己可访问的 Confluence Server/Data Center 内网站点及有效登录态，审核员可能无法连接到该内网。
- 如需视频演示，请使用脱敏数据而非真实内部页面或真实凭证。

**权限用途**：

- `tabs`：定位用户已经打开的 Confluence 标签页。
- `scripting`：在用户授权的 Confluence 页面运行本地打包的 API 请求逻辑。
- `storage`：只保存上次目标页面的 URL。
- `downloads`：用户主动点击手动备份或导出时保存文件。
- `optional_host_permissions`：仅在需要访问用户填写的 Confluence 站点时单独申请该站点权限；支持企业自定义内网域名与 HTTP/HTTPS。

**隐私**：见 [隐私声明](PRIVACY.md)。正式商店页面如要求一个可公开访问的隐私政策 URL，请发布为仓库内的 `docs/PRIVACY.md` 的 GitHub 网页地址，并确保与实际行为一致。

**可见性**：建议初次选择 `Unlisted`，供持链接的内部用户安装；也可根据实际目标选择 Public。
