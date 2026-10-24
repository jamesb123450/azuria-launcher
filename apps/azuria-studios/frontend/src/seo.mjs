const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function studioSEO({
  title,
  description,
  path = "",
  origin = "https://www.azuriasmp.org/",
  verification = "",
  preview = false,
}) {
  const site = new URL(origin);
  if (
    site.protocol !== "https:" ||
    site.username ||
    site.password ||
    site.search ||
    site.hash ||
    site.pathname !== "/"
  )
    throw new Error(
      "Studio AZURIA_SITE_URL must be an HTTPS origin without a path.",
    );
  if (verification && !/^[A-Za-z0-9_-]+$/.test(verification))
    throw new Error(
      "Use the Google site verification token, not a tag snippet.",
    );
  const canonical = new URL(path, site).href;
  const image = new URL("assets/launcher-home.jpg", site).href;
  const metadata = `<link rel="canonical" href="${escape(canonical)}"><meta name="robots" content="${preview || path === "404.html" ? "noindex, nofollow" : "index, follow, max-image-preview:large"}"><meta property="og:type" content="website"><meta property="og:site_name" content="Azuria Studios"><meta property="og:locale" content="en_GB"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(image)}"><meta property="og:image:alt" content="Azuria Launcher, a project by Azuria Studios"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${escape(image)}"><meta name="twitter:image:alt" content="Azuria Launcher, a project by Azuria Studios">${verification ? `<meta name="google-site-verification" content="${escape(verification)}">` : ""}`;
  return metadata;
}
