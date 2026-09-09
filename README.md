# Rumi书摘 · 微信读书同步扩展

从用户已登录的微信读书网页读取当前书籍的“我的笔记”，在浏览器右侧以书页卡片展示，并同步到 **Rumi书摘**。

> 非微信读书官方工具。仅用于用户主动导出、整理自己的书摘数据。

面向用户的安装、配对和同步说明见 [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)。

## 功能

- 支持 `https://weread.qq.com/web/reader/*`。
- 点击扩展图标打开 Chrome Side Panel / Firefox Sidebar。
- 自动读取当前书籍的全部书摘和想法；不区分马克笔、波浪线、直线。
- 页面声明条数与实际解析数不一致时禁止同步，避免静默漏传。
- 输入 Rumi书摘小程序生成的六位配对码绑定。
- 使用 `device_token` 调用 `/highlights/batch`，只同步本地未标记的新增书摘。
- 只有整批被服务端确认为 `accepted + duplicated == submitted` 才标记成功。
- `quota_exceeded`、部分失败、网络错误和令牌失效均不标记失败批次。

## 开发与验证

```bash
npm test
npm run build
npm run check
```

构建结果：

- Chrome：`dist/chrome/`
- Firefox：`dist/firefox/`

## 本地加载

### Chrome

1. 运行 `npm run build`。
2. 打开 `chrome://extensions`，启用“开发者模式”。
3. 选择“加载已解压的扩展程序”，打开 `dist/chrome/`。
4. 打开一本微信读书网页版书籍，点击扩展图标。

### Firefox

1. 运行 `npm run build`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 选择“临时载入附加组件”，打开 `dist/firefox/manifest.json`。
4. 打开一本微信读书网页版书籍，点击扩展图标。

## 数据与隐私

- 只读取当前书籍页面中 `.readerNoteList` 下的用户书摘节点。
- 只在用户打开侧栏或点击刷新时读取。
- 不读取、保存或上传微信读书 Cookie。
- 本地仅保存 Rumi 设备令牌、设备 ID 和已同步书摘指纹。
- 上传内容包括书名、作者、章节、书摘正文和用户自己的想法。

## 发布影响

扩展前端改动只需重新构建和发布扩展，不需要重新部署云函数。若线上 `ruminateapi` 尚未接受 `platform: "weread"` 或 `source: "weread"`，需先修改并重新部署该云函数。
