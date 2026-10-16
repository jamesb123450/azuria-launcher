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
  const releaseURL = `${repository}/releases/latest`;
  // GitHub resolves this stable URL at click time, including when the static build is older.
  const installer = `${repository}/releases/latest`;

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
    home: "A Windows-first Minecraft Java launcher in development. Organise instance settings, choose your theme and explore the Azuria interface.",
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
  const download = (label = "Download for Windows", extra = "") =>
    html`<a
      class="button primary"
      data-download-link
      href="${e(installer)}"
      ${extra}
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
          >${nav("Downloads", "downloads/")}${nav("Changelog", "changelog/")}${nav("Help", "help/")}${nav("Contact", "contact/")}<a
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
      >. Converted to WebP, cropped and darkened for the hero. Not captured in
      Azuria.
    </p>
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
            <h1>Azuria Launcher</h1>
            <p class="hero-tagline">Your Minecraft setups. Your own space.</p>
            <div class="hero-actions">
              ${download()}<a class="button secondary" href="${repository}"
                >View source ${icon("external", 17)}</a
              >
            </div>
            <span class="download-meta"
              ><span data-latest-version>${e(latest.tag)}</span> · Windows x64 ·
              Development build</span
            >
            ${status}
          </div>
        </div>
      </section>
      <div class="feature-ribbon" aria-label="Azuria at a glance">
        <div class="feature-ribbon-inner container">
          <a href="#features"
            >${icon("layers", 32)}<span
              ><strong>Your own library</strong
              ><small>Separate instance settings</small></span
            ></a
          >
          <a href="#appearance"
            >${icon("sun", 32)}<span
              ><strong>Dark or light</strong
              ><small>Make yourself at home</small></span
            ></a
          >
          <a href="${link("help/")}#updates"
            >${icon("refresh", 32)}<span
              ><strong>One installation</strong
              ><small>Signed in-app updates</small></span
            ></a
          >
          <a href="${link("downloads/")}"
            >${icon("windows", 32)}<span
              ><strong>Windows x64</strong
              ><small>Development preview</small></span
            ></a
          >
        </div>
      </div>
      <div class="preview-banner container">
        <span class="preview-label">IN DEVELOPMENT</span>
        <p>
          Help shape what comes next. Try the interface, follow the releases and
          tell us what you think.
        </p>
        <a href="${repository}/issues">Share feedback ${icon("arrow", 17)}</a>
      </div>
      <section id="updates" class="section container updates-section">
        <div class="section-topline">
          <div>
            <div class="section-kicker">THE LATEST FROM AZURIA</div>
            <h2>Latest updates</h2>
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
              return html`<article
                class="update-card"
                ${index === 0 ? "data-latest-card" : ""}
              >
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
      <section class="launcher-showcase container">
        <div class="section-kicker">MEET YOUR NEW LIBRARY</div>
        <h2>Everything has its place.</h2>
        <p>Create, organise and personalise your instance settings.</p>
        <figure class="hero-shot">
          <div class="shot-caption">
            <span><i class="tiny-mark"></i> YOUR LIBRARY. YOUR WAY.</span
            ><span>Instance library</span>
          </div>
          <img
            src="${asset("library.png")}"
            alt="Azuria’s dark library, showing separate Vanilla and Fabric instances, favourites, version selectors and account controls."
            width="1280"
            height="900"
            fetchpriority="high"
          />
        </figure>
      </section>
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
      <section id="appearance" class="appearance-section">
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
                data-preview-caption="Dark appearance · Instance library"
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
              Dark appearance · Instance library
            </figcaption>
          </figure>
        </div>
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
          <h2>Download Azuria.</h2>
          <p>Available for Windows x64. See requirements before installing.</p>
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
        <h1>Download Azuria.</h1>
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
          <h2>
            Azuria Launcher <span data-latest-version>${e(latest.tag)}</span>
          </h2>
          <p>
            The standard installer for the current Windows development build.
          </p>
          ${download("View latest download")}
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
        <h1>Release notes.</h1>
        <p>
          Published changes, straight from the project’s release notes. Install
          updates from Settings in Azuria.
        </p>
      </section>
      <div class="container changelog-layout">
        <aside class="changelog-aside">
          <span class="section-kicker">LATEST RELEASE</span
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
        <div class="section-kicker">HELP & INFORMATION</div>
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
              Read the <a href="${link("privacy/")}">privacy policy</a> for
              website hosting, account data and support information.
            </p>
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
  if (page === "privacy")
    content = html`<section class="page-intro container">
        <div class="section-kicker">YOUR INFORMATION</div>
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
              This website does not create accounts, set its own cookies, store
              preferences in your browser or include analytics, advertising
              trackers or embedded social feeds. Fonts and images are hosted
              with the website.
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
              <a href="${repository}/blob/main/docs/RECOVERY.md"
                >storage and recovery guide</a
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
        <div class="section-kicker">USING AZURIA</div>
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
            and availability can change. Game installation and launching are not
            currently available, and Minecraft Services access for Azuria is
            awaiting review. The
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
        <div class="section-kicker">GET IN TOUCH</div>
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
        <meta property="og:image" content="${e(siteURL)}assets/library.png" />
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
        <link rel="stylesheet" href="${link("site.css")}" />
        <script type="module" src="${link("site.js")}"></script>
      </head>
      <body class="${page === "home" ? "home-page" : "inner-page"}">
        ${header}
        ${
          page === "home"
            ? html`<aside
                class="explore-sidebar"
                aria-label="Launcher navigation"
              >
                <a
                  class="sidebar-item sidebar-download"
                  href="${link("downloads/")}"
                  >${icon("download", 25)}<span
                    ><strong>Download</strong
                    ><small>Windows development build</small></span
                  ></a
                >
                <a class="sidebar-item" href="#features"
                  >${icon("layers", 25)}<span
                    ><strong>Features</strong
                    ><small>Get to know Azuria</small></span
                  ></a
                >
                <a class="sidebar-item" href="#updates"
                  >${icon("refresh", 25)}<span
                    ><strong>Updates</strong
                    ><small>The latest releases</small></span
                  ></a
                >
                <a class="sidebar-item" href="#appearance"
                  >${icon("sun", 25)}<span
                    ><strong>Appearance</strong
                    ><small>Find your theme</small></span
                  ></a
                >
                <a class="sidebar-item" href="${link("help/")}"
                  >${icon("check", 25)}<span
                    ><strong>Support</strong
                    ><small>Answers & current status</small></span
                  ></a
                >
                <a class="sidebar-item" href="${repository}"
                  >${icon("external", 25)}<span
                    ><strong>GitHub</strong
                    ><small>Follow development</small></span
                  ></a
                >
                <div class="sidebar-foot">
                  <img
                    src="${asset("azuria.png")}"
                    width="30"
                    height="30"
                    alt=""
                  /><span>Windows x64<br />Minecraft Java</span>
                </div>
              </aside>`
            : ""
        }
        <main id="main" tabindex="-1">
          ${content}
          <aside
            class="latest-notice container"
            aria-label="Latest Azuria release"
            data-latest-notice
            data-built-tag="${e(latest.tag)}"
          >
            <div>
              <span class="section-kicker">LATEST RELEASE</span
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
