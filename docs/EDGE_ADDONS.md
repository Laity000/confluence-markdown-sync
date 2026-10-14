# Microsoft Edge Add-ons: 首次上架与 GitHub 自动更新

## 两个平台共用源码

Chrome/Windows 的 GitHub Releases 更新器保留原有 ZIP 名称；每次新版本 Release 另外添加 confluence-markdown-sync-edge-vX.Y.Z.zip。两个 ZIP 内容一致，只包含运行所需文件。Edge 商店版本不负责 Chrome 更新。

## 首次上架（必须手动完成）

1. 打开 https://partner.microsoft.com/dashboard ，使用 Microsoft 账号注册 Edge 扩展开发者（免费）。
2. 从 GitHub Releases 下载 confluence-markdown-sync-edge-vX.Y.Z.zip，或用 python3 scripts/package_extension.py --output dist/edge.zip 本地打包。
3. 在 Partner Center 创建 Edge 扩展商品，上传 ZIP，填写名称、用途、截图、隐私政策与权限说明，提交首次审核。Edge API 不能创建首次商品或修改商品描述。
4. 首次商品发布成功后，在扩展概览页面复制 Product ID（GUID）。这不是浏览器扩展 ID。
5. Partner Center → Microsoft Edge → Publish API，启用 v1.1，生成 Client ID 和 API key。不要将 API key 写进仓库或聊天。

## GitHub Actions 设置

进入仓库 Settings → Secrets and variables → Actions：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Variable | EDGE_PRODUCT_ID | Edge 商店商品 Product GUID |
| Secret | EDGE_CLIENT_ID | Edge Publish API v1.1 Client ID |
| Secret | EDGE_API_KEY | Edge Publish API v1.1 API Key |

如果没有配置 EDGE_PRODUCT_ID，Edge 商店发布作业会跳过，但新版本 Release 中仍然生成 Edge ZIP。已配置 Product ID 但缺少 API 密钥则会明确失败，不会影响 Chrome/Windows 发布。

## 以后如何自动发布

1. 修改代码并递增 manifest.json 的 version，推送 main。
2. GitHub Actions 运行原有 JavaScript 测试、新增 Python 测试并生成两份 ZIP、SHA256SUMS.txt 和新 GitHub Release。
3. 如果 Edge 产品已经配置，Actions 通过官方 Edge API v1.1 上传、查询上传结果、提交审核并查询提交结果。
4. 微软审核通过后，Edge 商店安装的扩展才会自动更新。工作流显示提交成功不等于审核通过。

## 本地检查

python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/package_extension.py --output dist/edge.zip
python3 scripts/publish_edge_addon.py --package dist/edge.zip --dry-run

## 审核注意

本项目需要用户主动授权 Confluence 网站；由于使用公司内网且可能使用 HTTP，微软审核不一定能访问，建议提前准备脱敏演示与权限解释。不要提交真实内网技术文档、账号或 Token。

官方资料： https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api
https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference
