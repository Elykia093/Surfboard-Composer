/**
 * 配置:从环境变量读取敏感信息,公开仓库零泄露
 *
 * 环境变量:
 *   ACCESS_TOKEN     - /sub/<token> 路径令牌 (必需)
 *   SUBSCRIPTION_URL - 上游订阅链接 (必需)
 *   PASSWORD_FILTER  - 可选,只提取密码匹配的节点,不设置则不过滤
 */
export function getConfig(env = {}) {
  const accessToken =
    typeof env.ACCESS_TOKEN === "string" ? env.ACCESS_TOKEN : "";
  const url =
    typeof env.SUBSCRIPTION_URL === "string" ? env.SUBSCRIPTION_URL : "";
  const passwordFilter =
    typeof env.PASSWORD_FILTER === "string" ? env.PASSWORD_FILTER : "";
  return {
    accessToken,
    subscriptionUrl: url,
    passwordFilter,
  };
}

/** 在线配置首行,供 Surfboard 检查并自动更新 */
export function buildManagedConfigLine(url) {
  const host = url.hostname;
  if (
    url.protocol !== "https:" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".invalid")
  ) {
    return "";
  }

  return `#!MANAGED-CONFIG ${url.origin}${url.pathname} interval=86400 strict=false`;
}
