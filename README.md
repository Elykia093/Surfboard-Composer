<p align="center">
  <a href="https://getsurfboard.com/">
    <img src="https://getsurfboard.com/img/logo.png" alt="Surfboard Logo" width="112">
  </a>
</p>

# Surfboard Composer

> 非官方项目。Surfboard 名称与 Logo 归其权利人所有；本项目仅提供配置转换能力。

[![CI](https://github.com/Elykia093/Surfboard-Composer/actions/workflows/ci.yml/badge.svg)](https://github.com/Elykia093/Surfboard-Composer/actions/workflows/ci.yml)

Cloudflare Workers + Vercel Edge: 实时将订阅链接转换为 **Surfboard 完整配置**。

## 功能

- 拉取订阅 → 解析 Surfboard 支持的订阅协议 → 生成完整 `.conf`
- `[General]`、`[Panel]`、`[Proxy]`、`[Proxy Group]`、`[Rule]` 全自动构建
- 自动从订阅中提取流量信息生成 `[Panel]` 订阅信息面板
- 主选择列表以 `Auto`（测速择优）、`Fallback`（按顺序故障转移）开头；`Traffic: 剩余流量` 作为虚拟组紧随 `US` 并跟随 `Auto`
- 透传标准 `subscription-userinfo` 流量统计；上游缺失时从正文剩余流量生成，并安全沿用上游文件名（默认 `Surfboard.conf`）
- 地区分组: **HK → SG → JP → KR → TW → UK → US**
- 23 个代理组: YouTube、Netflix、Spotify、Telegram 等
- 4231 条规则内置 (gzip 压缩)
- 在线 HTTPS 导入自动启用 Surfboard“检查更新”，每 24 小时后台刷新
- 公开入口统一为 `/sub/<token>`，缺少 `ACCESS_TOKEN` 时默认拒绝请求
- Workers 与 Vercel Edge 共用同一个 Fetch handler
- 支持 HTTP/HTTPS、SOCKS5/SOCKS5-TLS、Shadowsocks、VMess、Trojan、HY2、AnyTLS、TUIC v5、Snell 和 WireGuard；明确跳过 VLESS

## 部署

### 1. 克隆

```bash
git clone https://github.com/Elykia093/Surfboard-Composer.git
cd Surfboard-Composer
npm install
```

### 2. 配置环境变量

在 Cloudflare Workers 或 Vercel 项目环境变量中设置:

| 变量 | 说明 | 必填 |
|---|---|---|
| `ACCESS_TOKEN` | `/sub/<token>` 路径令牌 | 是 |
| `SUBSCRIPTION_URL` | 上游订阅链接 | 是 |
| `PASSWORD_FILTER` | 只提取密码匹配的节点；启用后会排除 WireGuard 等无 password 字段的节点 | 否 |

### 3. 构建

```bash
npm run build
```

产物: `dist/worker.js`

### 4. Cloudflare Workers 部署

```bash
npm run deploy
```

首次部署前创建 `wrangler.toml`（仓库已提供模板），并通过 `wrangler secret put` 设置 `ACCESS_TOKEN` 与 `SUBSCRIPTION_URL`。也可以手动粘贴 `dist/worker.js` 到 Cloudflare Workers 编辑器。

### 5. Vercel Edge 部署

导入仓库后在 Vercel 项目环境变量中设置 `ACCESS_TOKEN`、`SUBSCRIPTION_URL`，可选设置 `PASSWORD_FILTER`。Vercel 会运行项目构建并从 `dist/` 读取静态产物；`vercel.json` 会把 `/sub/<token>` 转发到 Edge Function，同时保留运行时可见的公开路径；直接访问内部 `/api/sub/...` 会返回 404。

## 访问

- `https://你的域名/sub/<token>` — 下载配置

通过上述 HTTPS 地址导入时，配置首行会自动写入 `#!MANAGED-CONFIG` 并指向当前 `/sub/<token>` 地址；本地生成配置不会写入在线更新地址。旧 `/` 和 `/sub` 路径不再提供配置，也不会重定向。

## 本地开发

```bash
npm test                           # 运行测试
npm run build                       # 生成规则数据并构建
```

## 目录结构

```
src/
  index.js       # Workers 适配器
  handler.js     # Workers/Vercel 共用 Fetch handler
  config.js      # 环境变量读取
  parser.js      # 订阅协议解析
  transform.js   # 节点 → Surfboard 行
  names.js       # 节点名清洗
  general.js     # [General] 模板
  groups.js      # 代理组构建
  rules.js       # 规则解压
  rules-data.js  # 规则模板生成数据
templates/
  general.txt    # [General] 参考模板 (运行时使用 src/general.js)
  rules.txt.gz   # 规则 (gzip)
test/
  handler.test.js
  index.test.js
  parser.test.js
  transform.test.js
  groups.test.js
scripts/
  build.cjs      # 构建脚本
```

## 许可证

MIT
