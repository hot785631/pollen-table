# 花粉擂台

适合 5–8 岁孩子的昆虫卡牌游戏。选一族，带上 16 张牌，在五条花道上争花粉。可以挑战电脑，也可以两个人坐在平板两端轮流出牌。

[打开游戏](https://hot785631.github.io/pollen-table/) · [规则和五族对阵胜率](https://hot785631.github.io/pollen-table/guide.html#balance) · [下载离线包](https://hot785631.github.io/pollen-table/pollen-table-v5.zip)

## 添加到手机或平板主屏幕

用系统浏览器打开游戏，点首页的「添加到主屏幕」。在 iPhone 和 iPad 的 Safari 中，点「分享」→「添加到主屏幕」。在 Android Chrome 中，也可以从菜单选择「安装应用」或「添加到主屏幕」。

第一次从主屏幕打开时请保持联网。首页显示「已存好，可以断网玩」后，就能从游戏图标离线进入。自配牌组保存在当前设备上。

## 开发

`src/` 是游戏源码，`docs/` 是可直接交给 GitHub Pages 发布的静态文件。运行以下命令需要 Node.js 20 或更新版本、Python 3，无需安装额外软件包。

```sh
node --test src/engine.test.cjs
node src/build.cjs
python src/package-tablet.py docs
python -m http.server 8000 --directory docs
```

在本机浏览器打开 `http://localhost:8000/`。GitHub Pages 从 `main` 分支的 `/docs` 发布。
