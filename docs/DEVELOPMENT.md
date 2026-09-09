# 开发指南

面向用户的安装和使用说明见根目录 [`README.md`](../README.md)。本文件面向开发者。

## 环境

- Node.js 18+（使用内置 `node --test`，无第三方运行时依赖）。
- 打包安装包需要系统 `zip` 命令（macOS / Linux 自带）。

## 常用命令

```bash
npm test        # 运行单元测试
npm run build   # 构建 dist/chrome 和 dist/firefox
npm run package # 构建并生成 releases/*.zip 安装包
npm run check   # 语法检查 + 测试 + 构建
```

## 目录结构

```text
browser-extension/
├── README.md                 # 用户使用指南（首页）
├── manifest.chrome.json      # Chrome MV3 清单
├── manifest.firefox.json     # Firefox MV3 清单
├── scripts/
│   ├── build.mjs             # 构建 dist/chrome、dist/firefox
│   └── package.mjs           # 打包 releases/*.zip
├── src/                      # 扩展源码（ESM）
├── test/                     # node --test 单元测试
├── docs/                     # 开发文档与截图素材
├── releases/                 # 已构建的安装包（随仓库分发）
└── dist/                     # 构建产物（不纳入版本控制）
```

## 从源码加载（开发调试）

### Chrome / Edge

1. 运行 `npm run build`。
2. 打开 `chrome://extensions`，启用“开发者模式”。
3. “加载已解压的扩展程序”，选择 `dist/chrome/`。

### Firefox

1. 运行 `npm run build`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. “临时载入附加组件”，选择 `dist/firefox/manifest.json`。

## 发布安装包

```bash
npm run package
```

会在 `releases/` 生成：

- `ruminote-weread-chrome-v<version>.zip`
- `ruminote-weread-firefox-v<version>.zip`

版本号取自 `package.json` 的 `version`。更新版本后需同步更新 `manifest.*.json` 与 `README.md` 中的安装包文件名。

## 架构说明

- `src/parser.js`：微信读书 DOM 与复制文本解析，Node 测试与浏览器共用。
- `src/content.js`：内容脚本，自动展开笔记面板、懒加载滚动、完整性校验。
- `src/sidepanel.*`：方案 A 书页卡片侧栏 UI 与状态控制。
- `src/fingerprint.js` / `src/sync.js`：稳定指纹、增量同步计划与整批成功判定。
- `src/api.js` / `src/storage.js`：`/device/bind`、`/highlights/batch` 客户端与本地持久化。
- `scripts/build.mjs`：把 ESM 源码与解析器合并为无模块依赖的 `content-bundle.js`，并分别写出双浏览器清单。

## 云函数发布影响

扩展改动只需重新构建和发布安装包，不需要重新部署云函数。若线上 `ruminateapi` 尚未接受 `platform: "weread"` 或 `source: "weread"`，需先修改并重新部署该云函数。
