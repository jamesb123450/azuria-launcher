// Trusted maintainer HTML, never accepted from a public form or launcher IPC.
export function advertisingMarkup(
  snippet,
  { enabled = false, consentReady = false } = {},
) {
  if (!enabled) return "";
  if (!consentReady)
    throw new Error(
      "Configure the approved consent message before enabling AdSense.",
    );
  const code = snippet.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (
    !code ||
    code.length > 16384 ||
    !/https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/.test(
      code,
    ) ||
    !/data-ad-client=["']ca-pub-\d{16}["']/.test(code) ||
    !/data-ad-slot=["']\d+["']/.test(code)
  )
    throw new Error(
      "Paste a complete AdSense display-unit snippet into website/src/adsense.html.",
    );
  return `<aside class="website-ad container" aria-label="Advertisement"><span>Advertisement</span>${code}</aside>`;
}
