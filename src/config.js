/**
 * 配置:从环境变量读取敏感信息,公开仓库零泄露
 *
 * 环境变量:
 *   SUBSCRIPTION_URL - 订阅链接 (必需)
 *   PASSWORD_FILTER  - 可选,只提取密码匹配的节点,不设置则不过滤
 */
export function getConfig(env) {
  const url = env.SUBSCRIPTION_URL || '';
  if (!url) {
    console.warn('[Config] SUBSCRIPTION_URL not set');
  }
  return {
    subscriptionUrl: url,
    passwordFilter: env.PASSWORD_FILTER || '',
  };
}