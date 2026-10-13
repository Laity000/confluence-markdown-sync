# Chrome Web Store 上架与自动更新指南

## 目标

- **首次**由开发者在 Chrome Web Store Developer Dashboard 创建一个商品（item），上传此工程生成的 ZIP，填写商店资料、隐私声明与审核信息，并等待审核通过。
- **后续**通过 GitHub Actions 创建 ZIP 并调用官方 Chrome Web Store Publish API **v2** 上传新版本、提交审核。商店审核通过并发布后，**从商店安装的用户**通过 Chrome 的扩展更新机制自动获得升级。
- **通过“加载已解压的扩展程序”安装的开发版不会通过商店自动更新**：应在商店上线后卸载开发版，重新从同一个商店商品安装。记下目标 Confluence 链接，以免本地扩展配置丢失。

## 第一次上架（必须自行操作）

1. 打开 <https://chrome.google.com/webstore/devconsole>，注册 Chrome Web Store 开发者，完成**一次性注册费**和开发者账号的 **两步验证**。
2. 在 GitHub 的 **Actions → Chrome Web Store release → Run workflow** 中保持 `publish=false`，运行一次，下载产物 `chrome-extension-package` 内的 `confluence-markdown-sync.zip`。也可以运行 `python3 scripts/package_extension.py` 在本地打包。
3. 在 Dashboard 选择 **Add new item**，手动上传上一步生成的 ZIP；在商店详情页补充描述、截图、隐私及权限说明、联系方式与审核说明（参考 `docs/STORE_LISTING_DRAFT.md`）。
4. 选择发布范围：如果主要在公司内网使用，推荐 **Unlisted（不公开列出，仅持链接可安装）**；这不代表绕过审核，也不等于只允许内部员工使用。由开发者确定是否需要公开可搜索（Public）。
5. 手动提交首次审核。**审核通过并发布**后，找到商品唯一的 32 位 `extension ID`，以及 Developer Dashboard 的 `Publisher → Settings` 中的 `publisher ID`。
6. 店铺审核可能要求演示。Confluence 是私有内网且使用账号密码，审核人员无法进入时应提供脱敏的操作截图/录屏及清楚的测试说明；不要将企业账号、内网业务文件或凭证发给审核人员。最终能否通过审核由 Google 决定。

## 连接 GitHub Actions（首次上架后设置一次）

1. 在 Google Cloud Console 中启用 **Chrome Web Store API**。创建一个 **service account**。
2. 在 Chrome Web Store Developer Dashboard 的账户设置将该 service account 的邮箱授予 API 管理权限（当前官方文档限制每个发布者仅能添加一个）。
3. 在 Google Cloud 为 service account 创建 JSON 密钥，妥善保管；切勿把它提交到 Git 仓库、分享在聊天中或放进扩展包。
4. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中设置：
   - **Secret** `CWS_SERVICE_ACCOUNT_JSON`：完整 service-account JSON 密钥（不要放在 Variables）。
   - **Variable** `CWS_PUBLISHER_ID`：Developer Dashboard 的 Publisher ID。
   - **Variable** `CWS_EXTENSION_ID`：首次上架商品的 extension ID。
5. 建议限制拥有仓库写入权和 GitHub Actions 编辑权的人员；密钥一旦泄露立即在 Google Cloud 轮换。避免在公共 PR 中运行发布步骤。

## 以后如何自动更新

- 将 `manifest.json` 的 `version` 递增（例如 1.3.0 → 1.3.1），修复 bug 并提交代码，等待 Tests 工作流通过。
- 在新提交上创建与 manifest 对应的 tag（`v1.3.1`）并 push 至 GitHub。
- `Chrome Web Store release` 工作流自动运行回归测试、构建 ZIP、调用 Chrome Web Store API v2 上传并**提交审核**。商店审核通过后自动发布到商店（遵循原来的可见性设置）。商店用户将在浏览器检查更新后自动获得更新。
- 如果只想测试构建，不发布：手动运行 `workflow_dispatch`，保留 `publish=false`。如果需要手动发起商店更新：在 GitHub Actions 手动运行时设置 `publish=true`（版本必须高于商店已有版本）。
- GitHub Actions 的 success 仅代表成功提交到商店，不代表审核已通过。到 Dashboard 检查审核状态。如警告阻断发布，先解决后重新提交。

## 注意事项

- 官方 API **不能跳过首次商店开发者登记、首次商品创建和必要的商店审核**。
- 此项目支持任意用户指定的 Confluence 内网域名，因此 `manifest.json` 的 `optional_host_permissions` 覆盖 HTTP/HTTPS 站点，但只在用户点击预览时请求对应站点授权。需在审核中准确说明权限用途；权限过宽或缺少证明可能导致审查或拒绝。
- 此扩展对 Confluence 页面采用**整页替换**，同步前必须人工预览。公司 HTTP 登录会话可能以明文传输；强烈建议公司网络逐步升级 HTTPS。
- 不依赖任何来自远端的 JavaScript（符合 Manifest V3 对远程代码的限制）。
- 不要将 **仓库本身 Public** 与 **Chrome 商店发布范围**混为一谈，它们是两种独立的设置。

## 官方链接

- [注册开发者](https://developer.chrome.com/docs/webstore/register/)
- [首次发布](https://developer.chrome.com/docs/webstore/publish/)
- [服务账号授权](https://developer.chrome.com/docs/webstore/service-accounts/)
- [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/using-api/)
- [API v2 上传方法](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload/)
- [权限说明](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions/)
