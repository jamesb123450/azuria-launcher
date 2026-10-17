// Named HTML templates let the formatter keep page markup readable.
// Dynamic release content and attribute values are escaped at their call sites.
const html = (parts, ...values) =>
  parts.reduce(
    (result, part, index) => result + part + (values[index] ?? ""),
    "",
  );
const repository = "https://github.com/jamesb123450/azuria-releases";
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const icon = (name, size = 20) =>
  html`<svg
    width="${size}"
    height="${size}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${{ arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>', check: '<path d="m5 12 4 4L19 6"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>', refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>', external: '<path d="M14 4h6v6m0-6L10 14M10 4H4v16h16v-6"/>', windows: '<path d="m3 5 8-1v8H3V5Zm10-1 8-1v9h-8V4ZM3 14h8v7l-8-1v-6Zm10 0h8v9l-8-1v-8Z"/>' }[name] || ""}
  </svg>`;
const date = (value) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
export function safeReleaseURL(value, asset = false) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname === "github.com" &&
      ["azuria-launcher", "azuria-releases"].some((repo) =>
        url.pathname.startsWith(`/jamesb123450/${repo}/releases/`),
      ) &&
      (!asset || url.pathname.endsWith(".exe"))
    );
  } catch {
    return false;
  }
}
export function releaseNotes(text) {
  // Only headings, lists and paragraphs are generated; release text never becomes raw HTML.
  return text
    .split(/\r?\n\s*\r?\n/)
    .filter(Boolean)
    .map((block) => {
      if (/^#{1,3} /.test(block))
        return html`<h3>${escapeHTML(block.replace(/^#{1,3} /, ""))}</h3>`;
      if (block.split(/\r?\n/).every((line) => line.startsWith("- ")))
        return html`<ul>
          ${block
            .split(/\r?\n/)
            .map((line) => html`<li>${escapeHTML(line.slice(2))}</li>`)
            .join("")}
        </ul>`;
      return html`<p>${escapeHTML(block).replace(/\r?\n/g, " ")}</p>`;
    })
    .join("");
}
export function render(page, { siteURL, base, releases, adsense = "" }) {
  const e = escapeHTML;
  const link = (path) => `${base}${path}`;
  const asset = (name) => link(`assets/${name}`);
  const latest = releases[0];
  const downloadRepository = latest?.url?.startsWith(
    "https://github.com/jamesb123450/azuria-launcher/releases/",
  )
    ? "https://github.com/jamesb123450/azuria-launcher"
    : repository;
  const releaseURL = `${downloadRepository}/releases/latest`;
  // GitHub resolves this stable URL at click time, including when the static build is older.
  const installer = `${downloadRepository}/releases/latest`;

  const titles = {
    home: "Azuria Launcher — Minecraft instances, organised",
    downloads: "Download Azuria Launcher for Windows",
    changelog: "Changelog — Azuria Launcher",
    help: "Help & current status — Azuria Launcher",
    privacy: "Privacy policy — Azuria Launcher",
    terms: "Terms of service — Azuria Launcher",
    contact: "Contact — Azuria Launcher",
    404: "Page not found — Azuria Launcher",
  };
  const descriptions = {
    home: "A Windows Minecraft Java launcher with Vanilla and Fabric launching, saved skins, instance controls and automatic updates.",
    downloads:
      "Download the Azuria development preview for Windows x64. Installation instructions, requirements and in-app update guidance.",
    changelog:
      "Published Azuria Launcher releases, changes and update information.",
    help: "Help with Azuria installation, signed updates, Microsoft sign-in and current development limitations.",
    privacy:
      "How the Azuria website and launcher handle data, hosting, account connections and support requests.",
    terms:
      "Terms for using the Azuria website and development builds, including third-party services and content rights.",
    contact:
      "Get help, report a bug or contact the Azuria project through GitHub.",
    404: "This page could not be found. Return to the Azuria Launcher website.",
  };
  const nav = (name, path) =>
    html`<a
      href="${link(path)}"
      ${page === name.toLowerCase() ? ' aria-current="page"' : ""}
      >${name}</a
    >`;
  const download = (label = "View Windows download", extra = "") =>
    html`<a
      class="button primary"
      data-download-link
      data-fallback-label="View Windows download"
      href="${e(installer)}"
      ${extra}
      >${icon("download", 18)}<span data-download-label>${label}</span></a
    >`;
  const status = html`<div class="development-note">
    <span class="status-dot"></span>
    <div>
      <strong>Development preview</strong>
      <p>
        Vanilla and Fabric launching, Microsoft sign-in and automatic updates
        are available in current Windows builds. See the release notes for your
        version.
      </p>
    </div>
  </div>`;
  const header = html`<a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="wordmark" href="${link("")}" aria-label="Azuria home"
          ><img
            src="${asset("azuria.png")}"
            width="44"
            height="44"
            alt=""
          /><span>azuria<span class="wordmark-small">LAUNCHER</span></span></a
        ><button
          class="menu-toggle"
          data-menu-toggle
          aria-controls="site-navigation"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          ${icon("menu")}
        </button>
        <nav id="site-navigation" aria-label="Main navigation">
          ${page === "home" ? html`<a class="section-nav" href="#features">Launcher</a><a class="section-nav" href="#appearance">Appearance</a><a class="section-nav" href="#updates">Updates</a>` : html`<a href="${link("")}">Home</a>${nav("Downloads", "downloads/")}${nav("Changelog", "changelog/")}`}
          ${nav("Help", "help/")}${nav("Contact", "contact/")}<a
            class="github-link"
            href="${repository}"
            >GitHub ${icon("external", 13)}</a
          >
        </nav>
        <a class="header-download" href="${link("downloads/")}"
          >Download ${icon("download", 16)}</a
        >
      </div>
    </header>`;
  const footer = html`<footer class="site-footer">
    <div class="footer-top">
      <a class="wordmark" href="${link("")}"
        ><img src="${asset("azuria.png")}" width="30" height="30" alt="" /><span
          >azuria</span
        ></a
      >
      <p>Minecraft Java, organised your way.</p>
      <a href="${repository}">View the project ${icon("external", 13)}</a>
    </div>
    <div class="footer-bottom">
      <span>An independent Minecraft Java launcher.</span>
      <div>
        <a href="${link("privacy/")}">Privacy policy</a
        ><a href="${link("terms/")}">Terms of service</a
        ><a href="${link("contact/")}">Contact</a
        ><a href="${repository}/issues">Report an issue</a>
      </div>
    </div>
    <p class="image-credit">
      Minecraft cherry grove:
      <a href="https://modrinth.com/resourcepack/karbin-panoramas"
        >Karbin_Drem · Distant Shaded Panoramas</a
      >
      ·
      <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a
      >. Panorama and fallback image converted to WebP and displayed with a
      contrast overlay. Not captured in Azuria.
    </p>
    <p class="disclaimer">
      Not an official Minecraft product. Not approved by or associated with
      Mojang or Microsoft.
    </p>
  </footer>`;
  let content = "";
  if (page === "home") {
    const summary = (release) =>
      (release.notes || "")
        .split(/\r?\n/)
        .find((line) => line.startsWith("- "))
        ?.slice(2) || "Read the published release notes.";
    content = html`<section class="brand-hero">
        <canvas
          class="hero-scene"
          data-panorama
          data-panorama-base="${asset("panorama-")}"
          aria-hidden="true"
        ></canvas>
        <div class="hero container">
          <div class="hero-copy">
            <img
              class="hero-mark"
              src="${asset("azuria.png")}"
              width="160"
              height="160"
              alt=""
            />
            <h1>Azuria Launcher</h1>
            <p class="hero-tagline">A home for your Minecraft instances.</p>
            <div class="hero-actions">
              ${download("View Windows download")}<a
                class="quiet-link"
                href="#features"
                >Explore the launcher</a
              >
            </div>
            <p class="download-meta">
              <span data-latest-version>${e(latest.tag)}</span> for Windows x64
            </p>
            <p class="hero-disclosure">
              <strong>Development preview.</strong> Windows x64 · Minecraft Java
              Edition. Vanilla and Fabric launching supported.
              <a href="${link("help/")}#status">Current status</a>
            </p>
          </div>
        </div>
      </section>
      <section
        id="features"
        class="section container launcher-showcase"
        aria-label="Azuria launcher features"
      >
        <figure class="hero-shot">
          <img
            src="${asset("library.webp")}"
            alt="Azuria’s current library with sample Vanilla and Fabric instances, Play controls and a player skin head."
            width="1280"
            height="900"
            fetchpriority="high"
          />
          <figcaption>
            Current launcher interface with sample instances and a demo account.
          </figcaption>
        </figure>
        <div class="section-intro">
          <h2>Organise your Minecraft instances.</h2>
          <p>
            Keep version and loader settings separate. Search, group and
            favourite your setups, and give each one its own icon.
          </p>
        </div>
        <div class="feature-details">
          <div>
            <h3>A setup for each version</h3>
            <p>
              Choose Minecraft and loader versions without mixing up your
              instance settings.
            </p>
          </div>
          <div>
            <h3>Find the right instance</h3>
            <p>
              Search your library, group related setups and keep favourites
              close.
            </p>
          </div>
          <div>
            <h3>Recognise it at a glance</h3>
            <p>Choose an icon and colour, or add your own artwork.</p>
          </div>
        </div>
        <p class="small-note">
          Play prepares game files and Java automatically for Vanilla and
          Fabric. Forge, NeoForge and Quilt launching remain in development.
        </p>
        <details class="create-detail">
          <summary>See instance creation</summary>
          <figure class="detail-shot">
            <img
              src="${asset("create.webp")}"
              alt="Azuria’s Create instance screen with the Custom setup option."
              width="1280"
              height="900"
              loading="lazy"
            />
            <figcaption>
              Create an instance, then choose its version and loader settings.
            </figcaption>
          </figure>
        </details>
      </section>
      <section
        class="section container product-tour"
        aria-labelledby="tour-heading"
      >
        <div class="section-intro">
          <h2 id="tour-heading">More of your launcher, in one place.</h2>
          <p>Manage how you play, how you look and what each instance needs.</p>
        </div>
        <article class="product-feature">
          <div class="product-feature-copy">
            <span class="section-kicker">Skins &amp; capes</span>
            <h3>A wardrobe of your own.</h3>
            <p>
              Save skins locally, turn the character preview to inspect them,
              choose Classic or Slim arms and select a cape you own. Apply your
              choice to your Minecraft account when you’re ready.
            </p>
            <p class="small-note">
              Official Steve texture shown with a demo account. Cape choices
              depend on your account.
            </p>
          </div>
          <figure class="detail-shot">
            <img
              src="${asset("skins.webp")}"
              width="1280"
              height="900"
              loading="lazy"
              alt="Current Azuria skin selector with a rotatable Steve preview and a saved skin card."
            />
            <figcaption>
              Saved skins and an interactive character preview.
            </figcaption>
          </figure>
        </article>
        <article class="product-feature reverse">
          <div class="product-feature-copy">
            <span class="section-kicker">Launcher settings</span>
            <h3>Make it feel right.</h3>
            <p>
              Appearance, account controls, Java, memory and window defaults sit
              in a centred settings popup. Save when you’re happy, or Reset to
              return to your last saved values.
            </p>
            <p class="small-note">
              Features still in development are marked in the app.
            </p>
          </div>
          <figure class="detail-shot">
            <img
              src="${asset("settings.webp")}"
              width="1280"
              height="900"
              loading="lazy"
              alt="Azuria’s centred settings popup with category navigation, theme cards and fixed Save and Reset buttons."
            />
            <figcaption>
              One settings popup with changes kept until you save.
            </figcaption>
          </figure>
        </article>
        <article class="product-feature">
          <div class="product-feature-copy">
            <span class="section-kicker">Your instances</span>
            <h3>Everything for one world.</h3>
            <p>
              Open an instance for its content, worlds, screenshots and live
              logs. Use per-instance overrides for Java, memory and window
              preferences without changing your launcher defaults.
            </p>
            <p class="small-note">
              Play becomes Stop during preparation and while Minecraft runs.
              Screenshots can be previewed, exported or opened in their folder.
            </p>
          </div>
          <figure class="detail-shot">
            <img
              src="${asset("instance.webp")}"
              width="1280"
              height="900"
              loading="lazy"
              alt="Azuria’s current instance page with Play, content navigation, logs, screenshots and settings controls."
            />
            <figcaption>
              Instance detail view with sample library content.
            </figcaption>
          </figure>
        </article>
      </section>
      <section id="appearance" class="appearance-section">
        <div class="container appearance-grid">
          <div class="section-copy">
            <h2>Choose your appearance.</h2>
            <p>
              Dark, light or your system setting. The same controls with
              Azuria’s pink and blue details.
            </p>
            <div
              class="preview-switch"
              role="group"
              aria-label="Launcher appearance preview"
            >
              <button
                aria-pressed="true"
                data-preview-image="${asset("library.webp")}"
                data-preview-alt="Azuria’s dark library with sample instance configurations."
                data-preview-caption="Dark appearance, populated library"
              >
                Dark</button
              ><button
                aria-pressed="false"
                data-preview-image="${asset("library-light.webp")}"
                data-preview-alt="Azuria’s light appearance with the same sample instances."
                data-preview-caption="Light appearance, sample library"
              >
                Light
              </button>
            </div>
            <p class="small-note">
              The same sample library in both themes. This control switches the
              launcher preview; the website keeps its dark appearance.
            </p>
          </div>
          <figure class="appearance-shot">
            <img
              data-theme-preview
              src="${asset("library.webp")}"
              width="1280"
              height="900"
              alt="Azuria’s dark library with sample instance configurations."
              loading="lazy"
            />
            <figcaption data-preview-caption>
              Dark appearance, populated library
            </figcaption>
          </figure>
        </div>
      </section>
      <section id="updates" class="section container updates-section">
        <div class="section-topline">
          <div>
            <h2>Latest release</h2>
            <p>What changed, straight from the published notes.</p>
          </div>
          <a class="text-link" href="${link("changelog/")}">Full changelog</a>
        </div>
        <div class="update-grid">
          ${releases
            .slice(0, 3)
            .map(
              (release, index) =>
                html`<article
                  class="update-card"
                  ${index === 0 ? "data-latest-card" : ""}
                >
                  <a
                    class="update-cover"
                    href="${safeReleaseURL(release.url) ? e(release.url) : releaseURL}"
                    aria-label="Read ${e(release.tag)} release notes"
                    ><span>${e(release.tag)}</span
                    >${index === 0 ? "<small>Latest release</small>" : ""}</a
                  >
                  <div class="update-body">
                    <time datetime="${e(release.published)}"
                      >${e(date(release.published))}</time
                    >
                    <h3>${index === 0 ? "What’s new" : "Earlier release"}</h3>
                    <p>${e(summary(release))}</p>
                    <a
                      class="text-link"
                      href="${safeReleaseURL(release.url) ? e(release.url) : releaseURL}"
                      >Read release notes</a
                    >
                  </div>
                </article>`,
            )
            .join("")}
        </div>
        <p class="updates-note">
          Already using Azuria? Updates are checked automatically at startup.
        </p>
      </section>
      <section class="section container questions">
        <div>
          <h2>Before you download</h2>
          <p>Platform support, updates and what works today.</p>
        </div>
        <div class="faq-list">
          ${faq("Can I play Minecraft through Azuria yet?", "Yes. Current Windows builds prepare and launch Vanilla and Fabric instances using a verified Minecraft Java account. Other loaders and live modpack installation are still in development.")}${faq("Which platforms are supported?", "Current builds support Windows x64. macOS, Linux and ARM64 builds are not available.")}${faq("How do updates work?", "Azuria checks for signed updates at startup and downloads them automatically. A restart countdown installs the update; choose Later to postpone. Updates wait while Minecraft is running.")}
        </div>
      </section>`;
  }
  if (page === "downloads")
    content = html`<section class="page-intro container">
        <h1>Download Azuria.</h1>
        <p>
          Try the Windows development preview. Your instance settings stay on
          your computer.
        </p>
      </section>
      <section class="container download-layout">
        <div class="download-card">
          <div class="download-platform">
            ${icon("windows", 32)}<span>Windows x64</span
            ><span class="outline-badge">Early access</span>
          </div>
          <h2>
            Azuria Launcher <span data-latest-version>${e(latest.tag)}</span>
          </h2>
          <p>
            The standard installer for the current Windows development build.
          </p>
          ${download("View Windows download")}
          <dl class="download-details">
            <div>
              <dt>Version</dt>
              <dd data-latest-version>${e(latest.tag)}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd data-latest-date>${e(date(latest.published))}</dd>
            </div>
            <div>
              <dt>Channel</dt>
              <dd>Development</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>Windows · x64</dd>
            </div>
          </dl>
          <a class="text-link" href="${e(releaseURL)}"
            >Release notes, signature & all files ${icon("external", 14)}</a
          >
        </div>
        <div class="download-aside">
          ${status}
          <h2>Before you install</h2>
          <ul class="plain-list">
            <li>A Windows x64 PC with Microsoft Edge WebView2 available.</li>
            <li>
              A Microsoft account that owns Minecraft Java Edition, plus
              internet access and free disk space for the first game
              installation.
            </li>
            <li>Only download builds from Azuria’s GitHub release page.</li>
            <li>
              Update signatures verify Azuria updates. Windows publisher signing
              is separate; development installers are not Authenticode signed.
            </li>
          </ul>
          <a class="text-link" href="${link("help/")}#installation"
            >Installation help ${icon("arrow", 16)}</a
          >
        </div>
      </section>
      <section class="section container steps-section">
        <div>
          <h2>Install once.<br />Update in the app.</h2>
        </div>
        <ol class="steps">
          <li>
            <span>01</span>
            <div>
              <h3>Download the installer</h3>
              <p>
                Use the Windows x64 installer above. Other platforms are not
                available yet.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Install and open Azuria</h3>
              <p>
                Follow the installer, then create an instance to explore
                version, loader and icon settings.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Keep it up to date</h3>
              <p>
                Azuria checks and downloads signed updates at startup. Restart
                to install, or choose Later and return to Settings → Updates.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section class="container simple-callout">
        <div>
          <h2>Looking for an earlier build?</h2>
          <p>
            Published installers and their release notes are kept on GitHub.
          </p>
        </div>
        <a class="button secondary" href="${repository}/releases"
          >Release archive ${icon("external", 15)}</a
        >
      </section>`;
  if (page === "changelog")
    content = html`<section class="page-intro container">
        <h1>Release notes.</h1>
        <p>
          Published changes, straight from the project’s release notes. Azuria
          checks for updates automatically at startup.
        </p>
      </section>
      <div class="container changelog-layout">
        <aside class="changelog-aside">
          <span class="section-kicker">Latest release</span
          ><strong data-latest-version>${e(latest.tag)}</strong
          ><span data-latest-date>${e(date(latest.published))}</span
          ><a class="text-link" href="${link("downloads/")}"
            >Get the installer ${icon("arrow", 15)}</a
          ><a class="quiet-link" href="${repository}/releases"
            >Full release archive</a
          >
        </aside>
        <section class="release-list" aria-label="Published releases">
          ${releases
            .map(
              (r, index) =>
                html`<article class="release-entry">
                  <header>
                    <div>
                      <h2>${e(r.tag)}</h2>
                      <time datetime="${e(r.published)}"
                        >${e(date(r.published))}</time
                      >
                    </div>
                    ${index === 0 ? '<span class="outline-badge">Latest</span>' : ""}
                  </header>
                  <div class="release-notes">${releaseNotes(r.notes)}</div>
                  <a
                    class="text-link"
                    href="${safeReleaseURL(r.url) ? e(r.url) : repository + "/releases"}"
                    >View on GitHub ${icon("external", 14)}</a
                  >
                </article>`,
            )
            .join("")}
        </section>
      </div>`;
  if (page === "help")
    content = html`<section class="page-intro container">
        <h1>Help & support.</h1>
        <p>Installation, updates and an honest look at what works today.</p>
      </section>
      <div class="container help-layout">
        <nav class="help-navigation" aria-label="Help topics">
          <a href="#status">Current capabilities</a
          ><a href="#installation">Installation</a><a href="#updates">Updates</a
          ><a href="#accounts">Microsoft sign-in</a
          ><a href="#privacy">Privacy & storage</a
          ><a href="#support">Get help</a>
        </nav>
        <div class="help-content">
          <section id="status">
            <h2>Current capabilities</h2>
            <p>
              Azuria is a Windows-first Minecraft Java launcher in development.
              Current builds support Vanilla and Fabric launching, with
              Minecraft Java ownership verified through Microsoft sign-in.
            </p>
            <table>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    Instance settings, icons, favourites and grouping
                  </th>
                  <td>Available</td>
                </tr>
                <tr>
                  <th scope="row">Dark, light and system themes</th>
                  <td>Available</td>
                </tr>
                <tr>
                  <th scope="row">Signed in-app updates</th>
                  <td>Available in updater-enabled Windows builds</td>
                </tr>
                <tr>
                  <th scope="row">Saved skins and owned capes</th>
                  <td>
                    Available; applying cosmetics requires a verified account
                  </td>
                </tr>
                <tr>
                  <th scope="row">Screenshot manager and live instance logs</th>
                  <td>Available in the Windows app</td>
                </tr>
                <tr>
                  <th scope="row">
                    Instance overrides and Save/Reset settings
                  </th>
                  <td>Available</td>
                </tr>
                <tr>
                  <th scope="row">Discover catalogue</th>
                  <td>Fictional local preview; no installation</td>
                </tr>
                <tr>
                  <th scope="row">Microsoft / Minecraft account connection</th>
                  <td>
                    Available for accounts with Minecraft Java Edition access
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    Game installation, Java setup and launching
                  </th>
                  <td>Available for Vanilla and Fabric</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section id="installation">
            <h2>Installation</h2>
            ${faq("What do I need?", "A Windows x64 PC with Microsoft Edge WebView2 available. The current release is a development preview. There are no supported macOS, Linux or ARM64 builds.")}${faq("Why might Windows show an unfamiliar publisher warning?", "Azuria’s development installers are not Windows Authenticode signed. The signature used by the in-app updater is a separate mechanism. Verify that you downloaded the installer from the project’s GitHub release page and make your own trust decision before running it.")}${faq("Can I use the browser preview to play?", "No. The browser preview is for trying the interface. Its local data is separate from the installed launcher, and it does not support account sign-in, desktop updates or game launching.")}
          </section>
          <section id="updates">
            <h2>Updates</h2>
            ${faq("How do I update?", "Azuria checks at startup and downloads signed updates automatically. When ready, a restart countdown installs the update. Choose Later to postpone, then use Settings → Updates to restart when convenient. Active games block installation.")}${faq("What is the .sig file?", "It is the installer’s update signature, not a private signing key. The updater checks signed downloads against the public key included in the app. You normally do not need to handle the signature file yourself.")}${faq("What if an update fails?", "Check your connection and retry from Settings. If needed, use the latest installer from the project’s GitHub release page. Include the error and your Azuria version when reporting a problem; do not include account tokens.")}
          </section>
          <section id="accounts">
            <h2>Microsoft sign-in</h2>
            <p>
              Azuria opens your default browser for Microsoft sign-in. The
              native app then checks Xbox and Minecraft Services access. Sign in
              with a personal Microsoft account that owns Minecraft Java
              Edition.
            </p>
            ${faq("Why does Minecraft Services deny Azuria access?", "Use the latest Azuria release and an account that owns Minecraft Java Edition, then try reconnecting. If access is still denied, report the exact error and launcher version. A generic HTTP 403 alone does not identify the cause; never include account tokens in a report.")}${faq("Which account should I use?", "A personal Microsoft account with Minecraft Java Edition access. An organisation owning the app registration does not mean players should use a work or school account.")}${faq("What does signing out remove?", "Signing out removes the saved Azuria account from Windows Credential Manager. Your browser may stay signed in to Microsoft. Failed or cancelled account switches preserve the previously saved account.")}
          </section>
          <section id="privacy">
            <h2>Privacy & storage</h2>
            <p>
              Read the <a href="${link("privacy/")}">privacy policy</a> for
              website hosting, account data and support information.
            </p>
            <p>
              ${adsense ? "Google AdSense display advertising is enabled on the home page. Google and its partners may process advertising requests and use cookies according to your consent choices. Manage your preferences through the consent message. This site has no website accounts." : "This website has no analytics, advertising scripts or website accounts."}
              Fonts and screenshots are served with the site. GitHub hosts the
              site and installer downloads and processes requests under its own
              policies.
            </p>
            <p>
              The desktop launcher stores instance settings locally. Refresh
              credentials use Windows Credential Manager; account tokens are
              handled in native code. The current app does not collect analytics
              or upload logs.
            </p>
            <p>
              Removing an instance keeps its files in local trash. Duplicating
              an instance can copy settings alone or include its local files.
              There is not yet a restore interface; read the recovery
              instructions before attempting manual recovery.
            </p>
            <a class="text-link" href="${repository}#accounts-and-local-data"
              >Storage & recovery instructions ${icon("external", 14)}</a
            >
          </section>
          <section id="support">
            <h2>Something not right?</h2>
            <p>
              Check the release notes first, then open an issue on GitHub.
              Include your Azuria version, Windows version, what you expected
              and the steps that caused the problem. Remove personal details
              from screenshots and never include account tokens or credentials.
            </p>
            <a class="button secondary" href="${repository}/issues"
              >Report an issue ${icon("external", 15)}</a
            >
            <p class="small-note">
              Public installers, release notes and support issues are available
              on GitHub. Launcher source is maintained separately.
            </p>
          </section>
        </div>
      </div>`;
  if (page === "privacy")
    content = html`<section class="page-intro container">
        <h1>Privacy policy</h1>
        <p>
          Last updated: 16 October 2026. This policy covers this website and the
          current Azuria development launcher.
        </p>
      </section>
      <div class="container legal-layout">
        <nav class="legal-toc" aria-label="Privacy sections">
          <a href="#operator">The project</a
          ><a href="#website-data">Website data</a
          ><a href="#launcher-data">Launcher data</a
          ><a href="#support-data">Support</a
          ><a href="#your-choices">Your choices</a>
        </nav>
        <article class="legal-content">
          <section id="operator">
            <h2>Who runs Azuria</h2>
            <p>
              Azuria is an independent project maintained by
              <a href="https://github.com/jamesb123450"
                >jamesb123450 on GitHub</a
              >. It is not operated by Microsoft or Mojang. The
              <a href="${link("contact/")}">contact page</a> lists the available
              ways to reach the project.
            </p>
          </section>
          <section id="website-data">
            <h2>When you visit this website</h2>
            <p>
              ${adsense ? `This website displays Google AdSense ads on its home page. Google and its advertising partners may process IP addresses, device information and cookies for ad delivery, measurement and, where you consent, personalised advertising. Use the consent message to accept, reject or manage choices. See <a href="https://policies.google.com/technologies/partner-sites">how Google uses information from partner sites</a>. No website accounts or social feeds are provided.` : "This website does not create accounts, set its own cookies, store preferences in your browser or include analytics, advertising trackers or embedded social feeds."}
              Fonts and images are hosted with the website.
            </p>
            <p>
              GitHub Pages hosts the website and GitHub Releases hosts
              downloads. GitHub receives technical request information, such as
              your IP address and browser details, to provide and secure those
              services. Its handling, retention and international processing of
              that information are described in the
              <a
                href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                >GitHub Privacy Statement</a
              >.
            </p>
            <p>
              When a page opens, your browser requests the latest published
              release from GitHub’s public API. This sends ordinary connection
              information to GitHub; it does not send launcher settings, account
              details or files. If the request fails, the last built release
              information remains visible and the latest-release link still
              works.
            </p>
          </section>
          <section id="launcher-data">
            <h2>When you use the launcher</h2>
            <p>
              The launcher stores instance settings, preferences and account
              profile information locally on your computer. Microsoft refresh
              credentials are saved through Windows Credential Manager.
              Authentication tokens are handled by the native launcher rather
              than collected by this website.
            </p>
            <p>
              Choosing Microsoft sign-in connects to Microsoft, Xbox and
              Minecraft Services for authentication, entitlement checks and
              profile information. Azuria does not ask you to enter your
              Microsoft password on this website. Microsoft processes those
              requests under its
              <a href="https://privacy.microsoft.com/en-gb/privacystatement"
                >Privacy Statement</a
              >.
            </p>
            <p>
              The current launcher checks GitHub for updates and contacts
              version-metadata services when you use relevant version selectors.
              Those providers receive normal network request information. The
              current app does not include analytics collection or automatically
              upload your logs to the project maintainer.
            </p>
          </section>
          <section id="support-data">
            <h2>Information you choose to share</h2>
            <p>
              If you create a GitHub issue, the maintainer can see your GitHub
              username and anything you submit. Issues are public. Share only
              the details needed to investigate the problem. Never post
              passwords, tokens, private logs or sensitive personal information.
            </p>
            <p>
              Support information is used to answer requests, investigate faults
              and maintain the project. The project’s interest in providing
              support is the reason for this processing. Public issues and their
              history can remain available until removed through GitHub’s
              controls; copies may exist outside the project’s control. The
              contact page has no active message form and does not collect or
              send form entries.
            </p>
          </section>
          <section id="your-choices">
            <h2>Your choices and rights</h2>
            <p>
              You can use the website without signing in. To remove saved
              launcher account credentials, sign out in Settings. Local
              preferences and instance files remain on your device until you
              remove them; deleting an instance may retain files in local trash.
              See the
              <a href="${repository}#accounts-and-local-data"
                >storage and recovery instructions</a
              >
              before removing files.
            </p>
            <p>
              Depending on applicable law, you may have rights to access,
              correct, delete or restrict the use of personal information, or to
              object to processing. For information held by GitHub or Microsoft,
              use that provider’s privacy request process. For information
              shared directly with the Azuria maintainer, use the
              <a href="${link("contact/")}">contact page</a> to request a
              suitable route without publishing sensitive details. UK users can
              also contact the
              <a href="https://ico.org.uk/make-a-complaint/"
                >Information Commissioner’s Office</a
              >.
            </p>
            <p>
              Changes to this policy will be published here with a revised date.
              New collection or integrations will be described before they are
              introduced.
            </p>
          </section>
        </article>
      </div>`;
  if (page === "terms")
    content = html`<section class="page-intro container">
        <h1>Terms of service</h1>
        <p>
          Last updated: 16 October 2026. These terms describe use of this
          website and the published Azuria development builds.
        </p>
      </section>
      <article class="container legal-content legal-single">
        <section>
          <h2>About the project</h2>
          <p>
            Azuria is an independent Minecraft Java launcher project maintained
            by <a href="https://github.com/jamesb123450">jamesb123450</a>. It is
            not an official Minecraft product and is not approved by or
            associated with Mojang or Microsoft. Contact the project through the
            <a href="${link("contact/")}">contact page</a>.
          </p>
        </section>
        <section>
          <h2>Development builds</h2>
          <p>
            Current builds are offered without charge for Windows x64. Features
            and availability can change. Current builds support Vanilla and
            Fabric launching with a verified Minecraft Java account. Other
            loaders and content integrations remain in development. The
            <a href="${link("help/")}#status">current status</a> and
            <a href="${link("changelog/")}">release notes</a> describe available
            functionality.
          </p>
          <p>
            Development software may contain errors or stop working with
            third-party services. Keep backups of important files and review
            release information before updating. Future features, platform
            support and completion dates are not promised.
          </p>
        </section>
        <section>
          <h2>Your responsibilities</h2>
          <p>
            Use Azuria and this website lawfully. Do not attempt to compromise
            the website, abuse third-party services, distribute malware or
            access accounts without permission. You are responsible for
            protecting your device, credentials and backups.
          </p>
          <p>
            Azuria does not include a Minecraft licence, paid game content or
            permission to bypass account checks. You must have the rights needed
            for any game, mod, resource pack or other content you use.
            Microsoft, Minecraft and other providers’ terms continue to apply to
            their services and content.
          </p>
        </section>
        <section>
          <h2>Downloads and third-party services</h2>
          <p>
            Use this website’s links to the project’s GitHub Releases for
            official Azuria builds. Signed in-app updates and Windows publisher
            signing are different mechanisms; current development installers are
            not Windows Authenticode signed. Third-party websites and services
            are operated independently and have their own terms and privacy
            policies.
          </p>
        </section>
        <section>
          <h2>Content and source code</h2>
          <p>
            Azuria branding, website content and source code remain subject to
            their owners’ rights. A public source repository does not itself
            grant a licence to reuse all project material. Follow any licence
            supplied with a specific file or dependency. Minecraft and other
            third-party names and assets belong to their respective owners.
          </p>
          <p>
            The hero screenshot is credited below under its own Creative Commons
            licence. That licence applies to the credited image and does not
            imply endorsement of Azuria.
          </p>
        </section>
        <section>
          <h2>Availability and your rights</h2>
          <p>
            The project does not promise uninterrupted availability,
            compatibility with every system or error-free operation. Nothing in
            these terms excludes or limits rights or responsibilities that
            cannot lawfully be excluded or limited, including applicable
            consumer rights.
          </p>
          <p>
            Changes to these terms will be published here with an updated date.
            Questions can be raised through the
            <a href="${link("contact/")}">contact page</a>. The
            <a href="${link("privacy/")}">privacy policy</a> explains how
            information is handled.
          </p>
        </section>
      </article>`;
  if (page === "contact")
    content = html`<section class="page-intro container">
        <h1>Contact Azuria</h1>
        <p>
          Report a problem, suggest an improvement or ask about the project.
        </p>
      </section>
      <div class="container contact-grid">
        <article class="contact-card">
          <span class="contact-icon">${icon("layers", 28)}</span>
          <h2>Report a bug</h2>
          <p>
            Include your Azuria version, Windows version and the steps that
            caused the problem. Check existing issues first.
          </p>
          <a class="button primary" href="${repository}/issues/new"
            >Open a GitHub issue ${icon("external", 16)}</a
          >
        </article>
        <article class="contact-card">
          <span class="contact-icon">${icon("external", 28)}</span>
          <h2>Project enquiries</h2>
          <p>
            Contact the maintainer through the public project on GitHub. There
            is no promised response time.
          </p>
          <a class="button secondary" href="${repository}/issues"
            >Visit the project ${icon("external", 16)}</a
          >
        </article>
      </div>
      <section class="container contact-note">
        <h2>Before you share</h2>
        <p>
          GitHub issues are public. Do not include passwords, access tokens or
          sensitive personal information. For a privacy or security concern, ask
          the maintainer for a suitable private contact route without posting
          the details publicly.
        </p>
        <p>
          Direct website messaging is not available. This page does not collect
          or send messages. Read the
          <a href="${link("privacy/")}">privacy policy</a> for more information.
        </p>
        <a class="text-link" href="${link("help/")}"
          >Read the help guide ${icon("arrow", 16)}</a
        >
      </section>`;
  if (page === "404")
    content = html`<section class="page-intro container not-found">
      <span class="section-kicker">404 · PAGE NOT FOUND</span>
      <h1>This path ends here.</h1>
      <p>
        The page may have moved. Head back to Azuria or find installation help.
      </p>
      <div class="hero-actions">
        <a class="button primary" href="${link("")}"
          >Back to home ${icon("arrow", 17)}</a
        ><a class="text-link" href="${link("help/")}">Help & information</a>
      </div>
    </section>`;
  const canonical =
    page === "home"
      ? siteURL
      : siteURL + (page === "404" ? "404.html" : page + "/");
  return html`<!doctype html>
    <html lang="en-GB">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${e(titles[page])}</title>
        <meta name="description" content="${e(descriptions[page])}" />
        <meta name="theme-color" content="#15161c" />
        <meta name="color-scheme" content="dark" />
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src https://api.github.com; object-src 'none'; base-uri 'none'; form-action 'none'"
        />
        <link rel="canonical" href="${e(canonical)}" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="${e(titles[page])}" />
        <meta property="og:description" content="${e(descriptions[page])}" />
        <meta property="og:image" content="${e(siteURL)}assets/library.webp" />
        <meta property="og:url" content="${e(canonical)}" />
        <meta name="twitter:card" content="summary_large_image" />
        ${page === "404" ? '<meta name="robots" content="noindex"/>' : ""}
        ${page === "home" ? html`<link rel="preload" as="image" href="${asset("minecraft-cherry-grove.webp")}" />` : ""}
        <link rel="icon" href="${asset("azuria.png")}" type="image/png" />
        <link
          rel="preload"
          href="${asset("inter-latin.woff2")}"
          as="font"
          type="font/woff2"
          crossorigin
        />
        <link
          rel="preload"
          href="${asset("sora-semibold.ttf")}"
          as="font"
          type="font/ttf"
          crossorigin
        />
        <link rel="stylesheet" href="${link("site.css")}" />
        <script type="module" src="${link("site.js")}"></script>
      </head>
      <body class="${page === "home" ? "home-page" : "inner-page"}">
        ${header}
        <main id="main" tabindex="-1">
          ${content} ${page === "home" ? adsense : ""}
          <aside
            class="latest-notice container"
            aria-label="Latest Azuria release"
            data-latest-notice
            data-built-tag="${e(latest.tag)}"
          >
            <div>
              <span class="section-kicker">Latest release</span
              ><strong data-latest-version>${e(latest.tag)}</strong
              ><span data-latest-date>${e(date(latest.published))}</span>
              <p data-release-status aria-live="polite">
                Release information from the last successful build. GitHub
                always has the current download.
              </p>
            </div>
            <a class="button secondary" href="${repository}/releases/latest"
              >View latest release ${icon("external", 16)}</a
            >
          </aside>
        </main>
        ${footer}
      </body>
    </html>`;
}
function faq(question, answer) {
  return html`<details>
    <summary>${escapeHTML(question)}<span aria-hidden="true">+</span></summary>
    <p>${escapeHTML(answer)}</p>
  </details>`;
}
