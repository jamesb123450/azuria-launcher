// Kept identical in both independent static websites; each Vercel root builds alone.
export function analyticsMarkup({
  id = "",
  base = "/",
  site = "launcher",
} = {}) {
  id = id.trim();
  if (id && !/^G-[A-Z0-9]{5,20}$/.test(id)) {
    throw new Error(
      "AZURIA_GA_MEASUREMENT_ID must be a GA4 measurement ID such as G-XXXXXXXXXX, not a script snippet.",
    );
  }
  return `<section class="analytics-banner" aria-label="Analytics preferences" hidden><div><h2>Your privacy, your choice</h2><p>${id ? "With your permission, we use Google Analytics to understand which pages are useful and improve the website. You can accept or reject analytics." : "We store your requested preferences in this browser. Optional analytics is currently disabled."} Read our <a href="${base}privacy/">privacy policy</a> and <a href="${base}cookie-policy/">cookie policy</a>.</p></div><div class="analytics-actions"><button type="button" data-analytics-choice="rejected">Reject analytics</button><button type="button" data-analytics-choice="accepted">Accept analytics</button></div></section><p class="analytics-announcement" aria-live="polite"></p><script src="${base}analytics.js" data-measurement-id="${id}" data-consent-key="azuria-${site}.analytics.v2" defer></script>`;
}
