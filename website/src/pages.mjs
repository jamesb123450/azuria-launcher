// Named HTML templates let the formatter keep page markup readable.
// Dynamic release content and attribute values are escaped at their call sites.
const html = (parts, ...values) =>
  parts.reduce(
    (result, part, index) => result + part + (values[index] ?? ""),
    "",
  );
const repository = "https://github.com/jamesb123450/azuria-launcher";
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
      url.pathname.startsWith("/jamesb123450/azuria-launcher/releases/") &&
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
export function render(page, { siteURL, base, releases }) {
  const e = escapeHTML;
  const link = (path) => `${base}${path}`;
  const asset = (name) => link(`assets/${name}`);
  const latest = releases[0];
  const releaseURL = safeReleaseURL(latest.url)
    ? latest.url
    : `${repository}/releases/latest`;
  const installer = safeReleaseURL(latest.installer, true)
    ? latest.installer
    : releaseURL;
  const size = latest.size
    ? `${(latest.size / 1000000).toFixed(1)} MB`
    : "Windows installer";
  const titles = {
    home: "Azuria Launcher — Minecraft instances, organised",
    downloads: "Download Azuria Launcher for Windows",
    changelog: "Changelog — Azuria Launcher",
    help: "Help & current status — Azuria Launcher",
    404: "Page not found — Azuria Launcher",
  };
  const descriptions = {
    home: "A Windows-first Minecraft Java launcher in development. Organise instance settings, choose your theme and explore the Azuria interface.",
    downloads:
      "Download the Azuria development preview for Windows x64. Installation instructions, requirements and in-app update guidance.",
    changelog:
      "Published Azuria Launcher releases, changes and update information.",
    help: "Help with Azuria installation, signed updates, Microsoft sign-in and current development limitations.",
    404: "This page could not be found. Return to the Azuria Launcher website.",
  };
  const nav = (name, path) =>
    html`<a
      href="${link(path)}"
      ${page === name.toLowerCase() ? ' aria-current="page"' : ""}
      >${name}</a
    >`;
  const download = (label = "Download for Windows", extra = "") =>
    html`<a class="button primary" href="${e(installer)}" ${extra}
      >${icon("download", 18)}${label}${icon("arrow", 17)}</a
    >`;
  const status = html`<div class="development-note">
    <span class="status-dot"></span>
    <div>
      <strong>Development preview</strong>
      <p>
        Game installation and launching aren’t available yet.
        Microsoft/Minecraft application access is awaiting review.
      </p>
    </div>
  </div>`;
  const header = html`<a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="wordmark" href="${link("")}" aria-label="Azuria home"
          ><img
            src="${asset("azuria.png")}"
            width="36"
            height="36"
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
          <a href="${link("")}#features">Features</a
          >${nav("Downloads", "downloads/")}${nav("Changelog", "changelog/")}${nav("Help", "help/")}<a
            class="github-link"
            href="${repository}"
            >GitHub ${icon("external", 13)}</a
          >
        </nav>
        <a class="header-download" href="${link("downloads/")}"
          >Get Azuria ${icon("arrow", 15)}</a
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
      <p>A launcher taking shape, one release at a time.</p>
      <a href="${repository}">View the project ${icon("external", 13)}</a>
    </div>
    <div class="footer-bottom">
      <span>An independent Minecraft Java launcher.</span>
      <div>
        <a href="${link("help/")}#privacy">Privacy</a
        ><a href="${link("help/")}#support">Get help</a
        ><a href="${repository}/issues">Report an issue</a>
      </div>
    </div>
    <p class="disclaimer">
      Not an official Minecraft product. Not approved by or associated with
      Mojang or Microsoft.
    </p>
  </footer>`;
  let content = "";
  if (page === "home")
    content = html`<section class="brand-hero">
        <div class="hero container">
          <div class="hero-copy">
            <div class="eyebrow">
              <span class="status-dot"></span> MINECRAFT JAVA · WINDOWS X64
            </div>
            <img
              class="hero-mark"
              src="${asset("azuria.png")}"
              width="88"
              height="88"
              alt=""
            />
            <h1>Azuria<span>Launcher</span></h1>
            <p class="hero-tagline">
              A little more you.<br />A place for every Minecraft setup.
            </p>
            <div class="hero-actions">
              ${download()}<a class="button secondary" href="#features"
                >Explore Azuria ${icon("arrow", 17)}</a
              >
            </div>
            <span class="download-meta"
              >${e(latest.tag)} · ${e(size)} · Windows development preview</span
            >
            ${status}
          </div>
          <figure class="hero-shot">
            <div class="shot-caption">
              <span><i class="tiny-mark"></i> YOUR LIBRARY. YOUR WAY.</span
              ><span>Interface preview · Example instances</span>
            </div>
            <img
              src="${asset("library.png")}"
              alt="Azuria’s dark library, showing separate Vanilla and Fabric instances, favourites, version selectors and account controls."
              width="1280"
              height="900"
              fetchpriority="high"
            />
          </figure>
        </div>
      </section>
      <nav class="quick-links container" aria-label="Explore Azuria">
        <a class="quick-link" href="${link("downloads/")}"
          ><span class="quick-icon">${icon("download", 25)}</span
          ><span
            ><strong>Download</strong
            ><small>Try the Windows preview</small></span
          >${icon("arrow", 18)}</a
        >
        <a class="quick-link" href="#features"
          ><span class="quick-icon">${icon("layers", 25)}</span
          ><span
            ><strong>The launcher</strong
            ><small>A closer look at Azuria</small></span
          >${icon("arrow", 18)}</a
        >
        <a class="quick-link" href="${link("changelog/")}"
          ><span class="quick-icon">${icon("refresh", 25)}</span
          ><span
            ><strong>Latest updates</strong
            ><small>Follow what’s changing</small></span
          >${icon("arrow", 18)}</a
        >
        <a class="quick-link" href="${link("help/")}"
          ><span class="quick-icon">${icon("check", 25)}</span
          ><span
            ><strong>Need a hand?</strong
            ><small>Setup, support & status</small></span
          >${icon("arrow", 18)}</a
        >
      </nav>
      <section id="features" class="section container">
        <div class="section-kicker">A PLACE FOR EACH SETUP</div>
        <div class="split-section">
          <div class="section-copy">
            <h2>Keep your versions<br />in good company.</h2>
            <p>
              A Vanilla survival world. A Fabric setup to experiment with. Save
              their settings separately, then find the one you need in your
              library.
            </p>
            <ul class="feature-list">
              <li>
                ${icon("layers")}
                <div>
                  <strong>Separate instance settings</strong
                  ><span
                    >Choose a Minecraft version and loader for each setup.</span
                  >
                </div>
              </li>
              <li>
                ${icon("check")}
                <div>
                  <strong>A library you can keep tidy</strong
                  ><span
                    >Search, group and favourite instances. Copy settings when
                    you want a fresh start.</span
                  >
                </div>
              </li>
              <li>
                ${icon("check")}
                <div>
                  <strong>Recognise it at a glance</strong
                  ><span
                    >Pick an icon, customise its colour or use your own
                    artwork.</span
                  >
                </div>
              </li>
            </ul>
            <p class="small-note">
              These controls save setup preferences. Game files and mod loaders
              are not installed yet.
            </p>
          </div>
          <figure class="detail-shot">
            <img
              src="${asset("create.png")}"
              alt="The Create instance menu in Azuria, with Custom setup available and future import options clearly disabled."
              width="900"
              height="650"
              loading="lazy"
            />
            <figcaption>
              Create an instance, without a maze of settings.
            </figcaption>
          </figure>
        </div>
      </section>
      <section class="appearance-section">
        <div class="container appearance-grid">
          <div class="section-copy">
            <div class="section-kicker">STILL AZURIA. IN EITHER LIGHT.</div>
            <h2>Make yourself<br />comfortable.</h2>
            <p>
              Dark, light, or whatever your system prefers. The same library and
              controls, with pink and blue details that don’t get in the way.
            </p>
            <div
              class="preview-switch"
              role="group"
              aria-label="Launcher appearance preview"
            >
              <button
                aria-pressed="true"
                data-preview-image="${asset("library.png")}"
                data-preview-alt="Azuria’s library in dark mode, with example instances."
                data-preview-caption="Dark appearance · Example instances"
              >
                Dark</button
              ><button
                aria-pressed="false"
                data-preview-image="${asset("library-light.png")}"
                data-preview-alt="Azuria’s empty library in light mode."
                data-preview-caption="Light appearance · Empty library"
              >
                Light
              </button>
            </div>
            <p class="small-note">
              Switch the screenshot to see both appearances.
            </p>
          </div>
          <figure class="appearance-shot">
            <img
              data-theme-preview
              src="${asset("library.png")}"
              width="1280"
              height="900"
              alt="Azuria’s library in dark mode, with example instances."
              loading="lazy"
            />
            <figcaption data-preview-caption>
              Dark appearance · Example instances
            </figcaption>
          </figure>
        </div>
      </section>
      <section class="section container discover-section">
        <div class="section-topline">
          <div>
            <div class="section-kicker">A LOOK AT WHAT’S NEXT</div>
            <h2>More to discover.</h2>
          </div>
          <span class="outline-badge">Interface preview</span>
        </div>
        <div class="discover-intro">
          <p>
            A home for modpacks, mods, datapacks and resource packs. Search and
            filter the example catalogue to explore the interface.
          </p>
          <p class="small-note">
            The projects and statistics shown are fictional. Live provider
            search, downloads and installation are not connected.
          </p>
        </div>
        <figure class="wide-shot">
          <img
            src="${asset("discover.png")}"
            width="1280"
            height="900"
            alt="Azuria Discover preview with category tabs, example project rows and a separate right-hand filter sidebar."
            loading="lazy"
          />
        </figure>
      </section>
      <section class="section container progress-section">
        <div class="section-copy">
          <div class="section-kicker">BUILT IN THE OPEN</div>
          <h2>You can see<br />where it stands.</h2>
          <p>
            Azuria is early in development. The interface and local library are
            ready to try; game downloads and launching are still ahead.
          </p>
          <a class="text-link" href="${link("help/")}#status"
            >See current capabilities ${icon("arrow", 17)}</a
          >
        </div>
        <div class="progress-list">
          <div>
            <span class="capability available">Available</span>
            <h3>Instance library & themes</h3>
            <p>
              Create settings, organise instances and personalise their icons.
            </p>
          </div>
          <div>
            <span class="capability available">Available</span>
            <h3>Signed in-app updates</h3>
            <p>Install published updates from Settings when you choose.</p>
          </div>
          <div>
            <span class="capability preview">Preview</span>
            <h3>Discover & account connection</h3>
            <p>
              Discover uses examples. Microsoft sign-in needs Minecraft Services
              access approval.
            </p>
          </div>
          <div>
            <span class="capability planned">In development</span>
            <h3>From settings to playing</h3>
            <p>Verified downloads, Java setup and game launching.</p>
          </div>
        </div>
      </section>
      <section class="section container updates-section">
        <div class="section-topline">
          <div>
            <div class="section-kicker">THE LATEST FROM AZURIA</div>
            <h2>Taking shape.</h2>
          </div>
          <a class="text-link" href="${link("changelog/")}"
            >All releases ${icon("arrow", 17)}</a
          >
        </div>
        <div class="update-grid">
          ${releases
            .slice(0, 3)
            .map((release, index) => {
              const summary =
                (release.notes || "")
                  .split(/\r?\n/)
                  .find((line) => line.startsWith("- "))
                  ?.slice(2) ||
                "See the changes in this published development release.";
              const destination = safeReleaseURL(release.url)
                ? release.url
                : `${repository}/releases/latest`;
              return html`<article class="update-card">
                <a
                  href="${e(destination)}"
                  class="update-cover"
                  aria-label="Read ${e(release.tag)} release notes"
                  ><img
                    src="${asset("azuria.png")}"
                    width="72"
                    height="72"
                    alt=""
                    loading="lazy"
                  /><span>${e(release.tag)}</span
                  ><small
                    >${index === 0 ? "LATEST RELEASE" : "DEVELOPMENT RELEASE"}</small
                  ></a
                >
                <div class="update-body">
                  <time datetime="${e(release.published)}"
                    >${e(date(release.published))}</time
                  >
                  <h3>Azuria ${e(release.version || release.tag)}</h3>
                  <p>${e(summary)}</p>
                  <a class="text-link" href="${e(destination)}"
                    >Read the changes ${icon("arrow", 16)}</a
                  >
                </div>
              </article>`;
            })
            .join("")}
        </div>
        <p class="updates-note">
          Already have Azuria? Install published updates from Settings.
        </p>
      </section>
      <section class="section container questions">
        <div>
          <div class="section-kicker">BEFORE YOU DOWNLOAD</div>
          <h2>A few useful things.</h2>
        </div>
        <div class="faq-list">
          ${faq("Can I play Minecraft through Azuria yet?", "Not yet. You can create and organise instance settings, but game installation and launching are still in development. Microsoft/Minecraft application access is also awaiting review.")}${faq("Which platforms does Azuria support?", "The current development builds target Windows x64. macOS, Linux and ARM64 are not supported releases.")}${faq("Will I need to download every update manually?", "No. Updater-enabled Windows builds check at startup. Open Settings and choose Update & restart to install an available signed update.")}
        </div>
      </section>
      <section class="closing container">
        <div>
          <span class="section-kicker">TAKE A LOOK AROUND</span>
          <h2>Try the development preview.</h2>
          <p>A first look at Azuria. A clearer idea of where it’s going.</p>
        </div>
        <div>
          ${download()}<a class="quiet-link" href="${link("downloads/")}"
            >Requirements & installation</a
          >
        </div>
      </section>`;
  if (page === "downloads")
    content = html`<section class="page-intro container">
        <div class="section-kicker">DOWNLOADS</div>
        <h1>A first look at Azuria.</h1>
        <p>
          Try the Windows development preview. Your instance settings stay on
          your computer.
        </p>
      </section>
      <section class="container download-layout">
        <div class="download-card">
          <div class="download-platform">
            ${icon("windows", 32)}<span>WINDOWS X64</span
            ><span class="outline-badge">Early access</span>
          </div>
          <h2>Azuria Launcher <span>${e(latest.tag)}</span></h2>
          <p>
            The standard installer for the current Windows development build.
          </p>
          ${download("Download installer")}
          <dl class="download-details">
            <div>
              <dt>Version</dt>
              <dd>${e(latest.tag)}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>${e(date(latest.published))}</dd>
            </div>
            <div>
              <dt>Download</dt>
              <dd>${e(size)}</dd>
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
              Game downloads, Java setup and Minecraft launching are not
              implemented.
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
          <div class="section-kicker">GETTING SET UP</div>
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
                Use Settings → Check for updates, then Update & restart when a
                new version is available.
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
        <div class="section-kicker">CHANGELOG</div>
        <h1>A little better,<br />with each release.</h1>
        <p>
          Published changes, straight from the project’s release notes. Install
          updates from Settings in Azuria.
        </p>
      </section>
      <div class="container changelog-layout">
        <aside class="changelog-aside">
          <span class="section-kicker">LATEST RELEASE</span
          ><strong>${e(latest.tag)}</strong
          ><span>${e(date(latest.published))}</span
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
        <div class="section-kicker">HELP & INFORMATION</div>
        <h1>A few things<br />worth knowing.</h1>
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
              It is not ready to replace a working launcher for playing
              Minecraft.
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
                  <th scope="row">Discover catalogue</th>
                  <td>Fictional local preview; no installation</td>
                </tr>
                <tr>
                  <th scope="row">Microsoft / Minecraft account connection</th>
                  <td>Implemented; Minecraft Services approval pending</td>
                </tr>
                <tr>
                  <th scope="row">
                    Game installation, Java setup and launching
                  </th>
                  <td>In development</td>
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
            ${faq("How do I update?", "Open Settings → Check for updates. When a release is available, choose Update & restart. Azuria also checks when it opens; installation happens only when you choose it.")}${faq("What is the .sig file?", "It is the installer’s update signature, not a private signing key. The updater checks signed downloads against the public key included in the app. You normally do not need to handle the signature file yourself.")}${faq("What if an update fails?", "Check your connection and retry from Settings. If needed, use the latest installer from the project’s GitHub release page. Include the error and your Azuria version when reporting a problem; do not include account tokens.")}
          </section>
          <section id="accounts">
            <h2>Microsoft sign-in</h2>
            <p>
              Azuria opens your default browser for Microsoft sign-in. The
              native app then checks Xbox and Minecraft Services access. The
              application’s Minecraft Services approval is currently pending.
            </p>
            ${faq("Why does Minecraft Services deny Azuria access?", "Microsoft and Xbox sign-in can succeed while Minecraft Services rejects the application. Azuria’s registration needs Minecraft access approval. The current generic HTTP 403 message does not, by itself, establish the exact service-side reason.")}${faq("Which account should I use?", "A personal Microsoft account with Minecraft Java Edition access. An organisation owning the app registration does not mean players should use a work or school account.")}${faq("What does signing out remove?", "Signing out removes the saved Azuria account from Windows Credential Manager. Your browser may stay signed in to Microsoft. Failed or cancelled account switches preserve the previously saved account.")}
          </section>
          <section id="privacy">
            <h2>Privacy & storage</h2>
            <p>
              This website has no analytics, advertising scripts or website
              accounts. Fonts and screenshots are served with the site. GitHub
              hosts the site and installer downloads and processes requests
              under its own policies.
            </p>
            <p>
              The desktop launcher stores instance settings locally. Refresh
              credentials use Windows Credential Manager; account tokens are
              handled in native code. The current app does not collect analytics
              or upload logs.
            </p>
            <p>
              Removing an instance keeps its files in local trash. Copying
              settings does not copy worlds or mods. There is not yet a restore
              interface; read the recovery guide before attempting manual
              recovery.
            </p>
            <a class="text-link" href="${repository}/blob/main/docs/RECOVERY.md"
              >Storage & recovery guide ${icon("external", 14)}</a
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
              A public repository does not imply Microsoft or Mojang
              endorsement. Project source and development notes are available on
              GitHub.
            </p>
          </section>
        </div>
      </div>`;
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
          content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
        />
        <link rel="canonical" href="${e(canonical)}" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="${e(titles[page])}" />
        <meta property="og:description" content="${e(descriptions[page])}" />
        <meta property="og:image" content="${e(siteURL)}assets/library.png" />
        <meta property="og:url" content="${e(canonical)}" />
        <meta name="twitter:card" content="summary_large_image" />
        ${page === "404" ? '<meta name="robots" content="noindex"/>' : ""}
        <link rel="icon" href="${asset("azuria.png")}" type="image/png" />
        <link
          rel="preload"
          href="${asset("inter-latin.woff2")}"
          as="font"
          type="font/woff2"
          crossorigin
        />
        <link rel="stylesheet" href="${link("site.css")}" />
        <script type="module" src="${link("site.js")}"></script>
      </head>
      <body>
        ${header}
        <main id="main" tabindex="-1">${content}</main>
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
