# LX-Sync Surfboard Worker

[![CI](https://github.com/Elykia093/Surfboard-worker/actions/workflows/ci.yml/badge.svg)](https://github.com/Elykia093/Surfboard-worker/actions/workflows/ci.yml)

Cloudflare Worker: 实时将订阅链接转换为 **Surfboard 完整配置** (HY2 节点)。

## 功能

- 拉取订阅 → 过滤 hysteria2 链接 → 生成完整 `.conf`
- `[General]`、`[Proxy]`、`[Proxy Group]`、`[Rule]` 全自动构建
- 地区分组: **HK → SG → JP → KR → TW → UK → US**
- 23 个代理组: YouTube、Netflix、Spotify、Telegram 等
- 4231 条规则内置 (gzip 压缩)
- 订阅更新时无需手动改动

## 部署

### 1. 克隆

```bash
git clone https://github.com/Elykia093/Surfboard-worker.git
cd Surfboard-worker
npm install
```

### 2. 配置环境变量

在 Cloudflare Workers 控制台设置:

| 变量 | 说明 | 必填 |
|---|---|---|
| `SUBSCRIPTION_URL` | 订阅链接 | 是 |
| `PASSWORD_FILTER` | 只提取密码匹配的节点 | 否 |

### 3. 构建

```bash
npm run build
```

产物: `dist/worker.js`

### 4. 部署

```bash
npm run deploy
```

或手动粘贴 `dist/worker.js` 到 Cloudflare Workers 编辑器。

## 访问

- `https://你的worker.workers.dev/` — 下载配置
- `https://你的worker.workers.dev/sub` — 同上

## 本地开发

```bash
npm test                           # 运行测试
node scripts/build.cjs             # 构建 (注入模板)
```

## 目录结构

```
src/
  index.js       # Worker 入口
  config.js      # 环境变量读取
  parser.js      # hysteria2 链接解析
  transform.js   # 节点 → Surfboard 行
  groups.js      # 代理组构建
  rules.js       # 规则解压
templates/
  general.txt    # [General] 模板
  rules.txt.gz   # 规则 (gzip)
test/
  parser.test.js
  groups.test.js
scripts/
  build.cjs      # 构建脚本
```

## 许可证

MIT