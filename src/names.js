/** Keep proxy names valid and consistent across [Proxy] and [Proxy Group]. */
const RESERVED_SELECTOR_NAMES = [
  "DIRECT",
  "Proxies",
  "YouTube",
  "Disney",
  "Hbomax",
  "Netflix",
  "Telegram",
  "Google",
  "OpenAI",
  "Spotify",
  "Steam",
  "Microsoft",
  "PayPal",
  "Apple",
  "Bahamut",
  "Bilibili",
  "Final",
  "HK",
  "SG",
  "JP",
  "KR",
  "TW",
  "UK",
  "US",
];

export function sanitizeNodeName(name, fallback = "Proxy") {
  const cleaned = String(name || fallback)
    .replace(/[\r\n,=\[\]]/g, "")
    .trim();
  return cleaned || fallback;
}

/** Generate deterministic names that cannot collide after sanitization. */
export function buildUniqueNodeNames(nodes) {
  const used = new Set(
    RESERVED_SELECTOR_NAMES.map((name) => name.toLowerCase()),
  );
  return nodes.map((node) => {
    const base = sanitizeNodeName(node.name, `${node.host}:${node.port}`);
    let name = base;
    let suffix = 2;
    while (used.has(name.toLowerCase())) name = `${base} ${suffix++}`;
    used.add(name.toLowerCase());
    return name;
  });
}
