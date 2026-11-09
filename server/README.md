# 匹配联测

[在 GitHub Codespaces 打开花粉擂台](https://codespaces.new/hot785631/pollen-table?quickstart=1)

选择创建工作区后，仓库会启动 Node 服务并转发 4173 端口。在「端口」里打开「花粉擂台 · 匹配测试」。用第二台设备测试时，把该端口的可见性设为 Public，把同一个 HTTPS 地址发给测试者。两边打开「匹配对战」、各点一个种族，就会看到同一房间号。停止 Codespace 即结束联测。运行时间和存储使用你的账户配额。[GitHub 端口转发说明](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)

本地或迁移到其他主机时，用 Node.js 22 执行 `node server/match.cjs`，浏览器打开 `http://localhost:4173/`。环境变量 `PORT` 可指定监听端口。该服务同源提供 `docs/` 游戏网页和接口，测试地址自动启用首页的匹配按钮。GitHub Pages 与离线游戏显示测试服开放状态。此版本只验证进队、等待、取消和分配房间。跨设备同步出牌是下一阶段。

| 接口 | 用途 |
| --- | --- |
| GET /api/match/v1/health | 检查服务版本 |
| POST /api/match/v1/ticket | 加入，JSON 请求体的 faction 可为 ant、bee、beetle、spider 或 butterfly |
| GET /api/match/v1/ticket | 获取本席状态、房间号和对手种族 |
| DELETE /api/match/v1/ticket | 取消等待或离开房间 |

三种 ticket 请求都使用 `Authorization: Bearer <随机 UUID>`。客户端为每次加入生成一个 UUID，重试沿用原值。等待中的客户端每两秒左右查询一次，一分钟无轮询即过期。配对结果最多保留五分钟，队列和房间保存在单个服务进程内。测试使用 `node --test server/match.test.cjs`。
