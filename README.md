# 我的宿舍小仓库

一个适合电脑和手机使用的个人宿舍物品清单。记录物品名称、分类、数量、图标和存放位置，并通过名称、备注或位置快速查找。

## 在线发布

本项目是原生 HTML、CSS 和 JavaScript 静态网页，不需要构建工具、后端或 API 密钥。可以将本目录中的文件放在 GitHub 仓库根目录，然后：

1. 在 GitHub 仓库的 **Settings → Pages** 中，将 **Build and deployment → Source** 设为 **GitHub Actions**。
2. 将本目录提交并推送到仓库的 `main` 分支。
3. 在仓库的 **Actions** 标签中等待 `Deploy GitHub Pages` 工作流完成。
4. 回到 **Settings → Pages** 查看公开访问地址。

仓库中已包含 `.github/workflows/pages.yml`，推送到 `main` 后会自动部署，也可以从 Actions 页面手动运行。

## 本地运行

安装 Node.js 后，在本目录运行：

```powershell
node server.js
```

然后打开终端显示的本地地址，默认是 `http://localhost:4173`。也可以使用任意本地静态文件服务器。

## 数据与隐私

物品、所选图标、分类和位置保存在访问者当前浏览器的 IndexedDB 中，不会上传到 GitHub 或其他服务器。每位访客有独立的数据；不同设备、不同浏览器以及本地地址和 GitHub Pages 地址之间不会自动共享。清除浏览器的网站数据可能会删除记录。

GitHub Pages 只托管网页文件。不要将个人物品清单或浏览器数据库文件提交到仓库。
