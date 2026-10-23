# Markdown → Confluence 同步（Windows / Chrome / Edge）

## 设计原则

这是 **浏览器扩展**，不是独立 EXE。它必须在你已经登录 Confluence 的浏览器中执行。不会要求再次输入用户名/密码，不读取、不保存 Cookie；对 Confluence 的 REST 请求是在已登录的 Confluence 页面内发出的。

仅适用于 **Confluence Server/Data Center** 类型的 `http://内网主机/[confluence/]pages/viewpage.action?pageId=123456` 页面。暂不支持 `/display/...` 链接和 Cloud API。

## v1.1 变更

- 「确认并同步」不再需要勾选整页替换复选框，也不再弹出二次确认。
- 同步不再自动下载 JSON 备份；保留手动备份按钮作为可选操作。
- 保留先预览再发布、提交前版本/正文检查、整页替换提示及 Confluence 页面历史。
- 从 v1.0 升级：用此新版文件夹替换旧扩展文件夹，在 `chrome://extensions` 或 `edge://extensions` 点击扩展卡片的「重新加载」，刷新已打开的工具页面。

## 安装（Windows 10/11）

1. 解压 ZIP 到一个**固定目录**，例如 `D:\Tools\ConfluenceSync`。不要直接在压缩包里运行。
2. 打开 Chrome：地址栏输入 `chrome://extensions`；Edge：输入 `edge://extensions`。
3. 打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」/「加载解压缩的扩展」，选中包含 `manifest.json` 的 **confluence_sync_ext** 文件夹。
5. 将扩展固定到工具栏，点击「Markdown → Confluence 内网同步」图标打开工具页面。
6. 浏览器可能提示该扩展尚未受商店审核，或公司策略禁止加载未打包扩展。若企业策略禁止安装，请联系 IT 审核；不要尝试绕过策略。

## 使用

1. 在同一个浏览器中，用公司账号登录内网 Confluence，打开待更新的页面。
2. 单击扩展图标；页面 URL 支持自动填入，也可粘贴完整页面链接。
3. 选择 Markdown 文件，或直接粘贴文本。支持 UTF-8 和 GBK/GB18030 文件编码。
4. 点击「连接并生成同步预览」。首次会弹出浏览器授权，请**确认所请求的站点就是你的内网 Confluence**，仅授权该域名。
5. 核对页面标题、pageId、版本、Storage 转换方法、差异、源码。初次建议在测试页验证标题、代码块、表格。
6. 查看预览后直接点击「同步更新页面」，无须勾选、弹窗确认或自动下载备份。此操作**整页替换**现有正文，请务必核对预览。
7. 同步时会再次读取远端页面，版本号、标题或正文有变化即停止更新；也不会自动重试冲突。
8. 页面本身的 URL、标题不变；成功会生成一个新版本，可通过 Confluence 页面历史恢复。需要 JSON 备份时，另行点击「手动下载原页面备份（可选）」。

## 登录说明

**仅仅在浏览器登录，不代表任意 EXE/离线 HTML 都有登录态。** 本工具用 `chrome.scripting.executeScript({world:'MAIN'})` 在目标 Confluence 标签页运行 `fetch(credentials:'same-origin')`，由浏览器自动附带该站点的现有会话 Cookie。扩展不接收、不读取 Cookie 和账号密码。

如果 API 返回 401/403/HTML，可能是会话失效、REST 权限不足、服务器禁用了该接口、反向代理限制或企业浏览器策略。此时不会尝试提供绕过方法。

## 格式转换策略

- 默认优先复用此前的 JavaScript Markdown → Wiki Markup 转换模块，再使用官方 REST `/rest/api/contentbody/convert/storage` 转为 Confluence Storage XHTML，力求和手动「插入 Wiki 标记」一致。
- 如果这个 API 被禁用或版本不支持，默认退回本地基础 Storage 转换。页面会明确标识兼容模式，并提示用户检查代码块、表格等内容；可在下拉框选择「仅服务器转换」以禁止回退。
- 复杂嵌套 Markdown、LaTeX、Mermaid、插件专用宏、HTML 和本地图片附件尚不支持完整保真；含 Markdown 图片时禁止自动发布，以免丢失图片。
- **整页替换**，包括旧页面手工编辑的内容和旧宏；工具会提示原页面的宏数量。不要拿已有大量复杂 Confluence 宏的页面直接测试。先建测试页。

## 安全性、可选备份与并发

- 工具不存储 Markdown 文件内容、密码、Cookie，只记住上次填写的页面 URL（浏览器扩展本地存储）。
- 首次授权范围仅为用户填写的 Confluence 站点。仅在完成预览后允许一键发布，不弹二次确认框。
- 默认不下载备份，也不会由于未下载备份而阻止同步。如有需要，可手动点击「手动下载原页面备份（可选）」，导出旧页面 `storage` 原文及标题/版本/URL 的 JSON。Confluence 自身的页面历史仍保留。
- 提交前重新 GET，检查版本、标题、Storage 原文相同；不同时停止。PUT 附带新版本号；若有并发修改，服务器应返回版本冲突。
- 即便如此，仍存在小的读写竞争窗口，最终以 Confluence 服务端乐观并发控制为准。
- **HTTP 是明文传输**：由于你们使用 `http://`，登录会话以及请求正文可能在内网传输中被窃听或篡改。本工具无法消除该风险；建议向 IT 申请内网 HTTPS，且只在可信企业网络中使用。
- 建议先在一张可丢弃的测试页尝试，确认兼容性后再用于正式技术文档。

## 还原备份

下载的 JSON 文件完整保留页面 ID、标题、备份时的版本和旧 Storage 正文。最稳妥的恢复途径是直接在 Confluence 的「页面历史」中恢复到同步前的版本。JSON 备份也可供技术人员恢复，但不能直接在编辑器中当 Markdown 导入。

## 排障

- “没有找到同一站点的 Confluence 标签页”：在**同一个浏览器配置文件**打开 Confluence，等待加载完成，再试。
- “接口返回 HTML”：浏览器登录态不存在、重定向到了登录页或接口被拦截。
- “HTTP 401/403”：会话无效或当前用户无读写/转换权限。
- “HTTP 404（convert/storage）”：试试默认的本地兼容模式，检查 Storage 预览，优先申请管理员核实接口支持情况。
- “版本冲突”：重新生成预览；不要强制更新。
- “手动备份下载超时”：查看浏览器下载管理器及“每次询问保存位置”设置。备份与发布互相独立，不影响同步。
- “公司禁止加载扩展”：请走 IT 审批或另行设计经批准的本地同步客户端；无需交出账号密码。

## 文件结构

- `manifest.json` 扩展清单
- `background.js` 点击扩展图标打开工作台
- `editor.html/css/js` 可视化操作和同步界面
- `wiki-converter.js` **从之前的离线 HTML 工具抽取，逻辑复用**
- `storage-converter.js` 本地 Storage XHTML 兼容转换
- `sync-core.js` URL/页面/冲突/备份的可测试纯函数
- `test_*.js` Node.js 模拟测试代码（普通用户安装与运行无需 Node.js）

本工具未在你的企业内网 Confluence 上真实写入测试（无法访问内网）。请先验证只读预览与测试页更新，再用于正式页面。


## v1.2 方括号修复

- 修复 `STRING[80]`、`ARRAY[1..5]`、`ARR[1,2]` 在 Wiki 转换时被误解析为新建 Confluence 页面链接。
- 普通正文、标题、列表、表格等输出 Wiki Markup 时仅转义右方括号，例如 `STRING[80\]`（最终 Confluence 应显示 `STRING[80]`），不转义左方括号以避免 CONFSERVER-55799 中的 Wiki 编辑器兼容性问题。
- Markdown 正规链接 `[标题](URL)`、图片、围栏代码块不会被误转换为普通文本；直接 Storage XHTML 转换原样保留方括号。
- 回归测试：`node test_brackets_regression.js`。已做本地转换单元测试，仍需在你的实际 Confluence Server/Data Center 上用一张测试页确认渲染。
- 如果页面已被旧版同步成错误的链接，请升级扩展并用未被污染的原始 Markdown 重新预览、同步一次。

## v1.3 行内代码解析修复

- 将 Markdown 行内代码如 `` `VARSTRUCT1.B[index]` `` 正确转换为 Confluence 等宽代码，不将 `index` 解析为页面链接。
- 支持单反引号和长度匹配的双反引号，如 `` `` `code` `` ``（参见测试样例）。
- 修复加粗、删除线与行内代码组合时偶发的特殊占位符残留。
- 回归测试：`node test_inline_code_regression.js`。升级后需要在扩展管理页重新加载扩展，重新生成同步预览。

## Chrome Web Store 自动更新发布

已支持 Chrome Web Store 上架和 GitHub Actions 自动提审：`python3 scripts/package_extension.py` 可生成纯扩展 ZIP；`.github/workflows/chrome-web-store.yml` 在推送与 `manifest.json` 版本一致的 `v*` 标签后自动打包、运行测试、并在已配置服务账号的情况下上传到 Chrome Web Store 提交审核。首次仍需在 [Chrome Web Store 开发者后台](https://chrome.google.com/webstore/devconsole) 自行注册、创建商品并完成首次审核。详细步骤和权限说明见 [上架与自动更新指南](docs/CHROME_WEB_STORE.md)。

注意：GitHub tag 触发的是**提交商店审核**，审核通过且发布后，**从商店安装**的用户才会通过 Chrome 自动更新；加载解压目录的开发版不会自动更新。建议公司内网工具选用商店 Unlisted，而不是将含真实内网资料的截图/示例放在公开商店详情页。


## v1.4 · GitHub Releases + Windows 自动更新

请阅读 [Windows 自动更新安装与安全说明](docs/WINDOWS_AUTO_UPDATE.md)。首次执行安装脚本后，Chrome 只需要加载已解压的插件目录一次。此后 Windows 每小时从指定仓库的最新正式 GitHub Release 检查版本、校验 SHA256、更新文件；扩展的背景服务每 2 分钟发现本地版本标记后，在未打开同步编辑器时自行 `chrome.runtime.reload()`。新版未替代 Chrome/Edge 商店的正式原生自动更新，仅针对通过“加载已解压的扩展程序”安装的 Windows 版本。

## Windows auto-update v1.4.1 hotfix

Fixes `Unrecognized extension ... manifest.json` when a Windows PowerShell 5.1 machine decodes a BOM-less UTF-8 updater script with the local ANSI code page. Reinstall the Windows updater from this release with the SAME extension folder path; the existing Chrome extension remains installed. See [Windows updater guide](docs/WINDOWS_AUTO_UPDATE.md).

## v1.4.2：修复行内代码中的方括号误链接

Confluence Server 的 Wiki 解析器可能将 `{{VARSTRUCT1.B[index]}}` 中的 `[index]` 当作待创建页面链接，导致同步结果出现 `createpage.action?title=index`。这是 Confluence Wiki 二次解析，不是 Markdown 反引号闭合错误。

当 Markdown 中包含 `VARSTRUCT1.B[index]`、`STRING[80]` 等 PLC 方括号表达式时，「自动」模式将**绕过服务器 Wiki 转换**，直接由本地转换器生成 Confluence Storage XHTML。行内代码会输出 `<code>VARSTRUCT1.B[index]</code>`，不包含链接；「仅服务器 Wiki」模式将明确拒绝，以免污染页面；普通文档保持此前的服务器优先策略。

注意本地转换器只支持基本 Markdown 格式，预览时请再次核对复杂表格和宏；已被污染的页面需要从原始 Markdown 重新生成预览并同步。包含 PLC 方括号表达式的内容将禁止复制或导出存在解析风险的 Wiki Markup。

## Microsoft Edge Add-ons 自动发布

每次新版本的 GitHub Release 同时生成 Chrome/Windows 和 Microsoft Edge ZIP。首次需在微软 Partner Center 手动上架；完成后配置 GitHub Actions 的 EDGE_PRODUCT_ID、EDGE_CLIENT_ID、EDGE_API_KEY，即可自动将后续版本提交 Edge 审核。详见 [Edge 发布指南](docs/EDGE_ADDONS.md)。


## v1.4.4：Chrome / Edge 统一名称

浏览器扩展正式名称统一为 **Markdown → Confluence 同步**。旧版 v1.4.1～v1.4.3 Windows 更新器严格检查旧名称；Chrome 用户需从 v1.4.4 GitHub Release 下载 Windows 更新器安装包、仍选择原有扩展目录重装**更新器**一次（不卸载扩展），完成后后续自动更新照常工作。Edge 首次上架直接使用 v1.4.4 ZIP。

## v1.4.5：修复水平分割线与 YAML Front Matter 转换

- 将独立成行的 Markdown `---` 转换为 Confluence Wiki Markup 水平分割线 `----`。
- 识别文件开头格式正确且包含 YAML 字段的 Front Matter，并在转换正文前移除元数据区。
- 保留 Setext 二级标题、表格分隔行以及围栏代码块中的 `---` 原有语义。
- 增加对应回归测试，避免分割线与元数据边界相互误判。
