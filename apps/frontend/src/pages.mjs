import { renderHomepage } from "./homepage.mjs";
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
        <a class="wordmark" href="${link("")}" aria-label="Azuria Launcher home"
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
  const footer = html`<footer class="site-footer premium-footer">
    <div class="premium-footer-grid">
      <div>
        <a class="wordmark" href="${link("")}"
          ><img
            src="${asset("azuria.png")}"
            width="40"
            height="40"
            alt=""
          /><span>azuria</span></a
        >
        <p>Minecraft, organised.<br />Made by Azuria Studios.</p>
      </div>
      <div>
        <h2>Launcher</h2>
        <a href="${link("downloads/")}">Downloads</a
        ><a href="${link("changelog/")}">Changelog</a
        ><a href="${link("help/")}">Help &amp; support</a
        ><a href="${repository}">GitHub ${icon("external", 13)}</a>
      </div>
      <div>
        <h2>Azuria Studios</h2>
        <a href="${link("contact/")}">Contact</a
        ><a href="${link("privacy/")}">Privacy policy</a
        ><a href="${link("terms/")}">Terms of service</a
        ><a href="${repository}/issues">Report an issue</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 Azuria Studios</span
      ><span
        >Not an official Minecraft product. Not approved by or associated with
        Mojang or Microsoft.</span
      >
    </div>
    <details class="footer-credits">
      <summary>Image credits</summary>
      <p class="image-credit">
        Minecraft cherry grove:
        <a href="https://modrinth.com/resourcepack/karbin-panoramas"
          >Karbin_Drem · Distant Shaded Panoramas</a
        >
        ·
        <a href="https://creativecommons.org/licenses/by-sa/4.0/"
          >CC BY-SA 4.0</a
        >. Panorama and fallback image converted to WebP and displayed with a
        contrast overlay. Not captured in Azuria.
      </p>
    </details>
  </footer>`;
  let content = "";
  if (page === "home") {
    content = renderHomepage({
      asset,
      link,
      download,
      icon,
      releases,
      releaseURL,
      escapeHTML,
      safeReleaseURL,
      date,
      html,
    });
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
          See what changed in each release. Azuria checks for updates when you
          open the launcher.
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
        <p>Help with installation, updates and supported features.</p>
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
                    Instance overrides and save and reset controls
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
          Last updated: 19 October 2026. How Azuria handles information when you
          visit this website or use the launcher.
        </p>
      </section>
      <div class="container legal-layout">
        <nav class="legal-toc" aria-label="Privacy sections">
          <a href="#operator">About this policy</a
          ><a href="#information">Information we use</a
          ><a href="#website-data">Website & cookies</a
          ><a href="#sharing">Service providers</a
          ><a href="#retention">Storage & retention</a
          ><a href="#your-choices">Your rights</a
          ><a href="#policy-changes">Changes & contact</a>
        </nav>
        <article class="legal-content">
          <section id="operator">
            <h2>1. About this policy</h2>
            <p>
              Azuria Launcher is an independent Minecraft Java launcher
              developed and maintained by Azuria Studios. In this policy,
              “Azuria”, “we” and “our” mean Azuria Studios. Azuria is not
              affiliated with Microsoft or Mojang.
            </p>
            <p>
              This policy covers the Azuria website, launcher and
              project-operated content service. Third-party services have their
              own policies. Read this alongside our
              <a href="${link("terms/")}">terms of service</a>.
            </p>
          </section>
          <section id="information">
            <h2>2. Information we use and why</h2>
            <p>
              <strong>Launcher data.</strong> Preferences, Minecraft profile
              information, instances, skins, screenshots and game logs are
              stored on your computer to provide launcher features. Saved
              sign-in credentials are protected using Windows Credential
              Manager. Azuria does not receive or store your Microsoft password.
            </p>
            <p>
              <strong>Accounts and downloads.</strong> Microsoft, Xbox and
              Minecraft Services authenticate your account, check game ownership
              and provide your profile, skins and capes. Update, game-file and
              community-content requests include connection information, such as
              your IP address, and relevant searches, versions or content
              identifiers to deliver results and downloads.
            </p>
            <p>
              <strong>Support.</strong> If you contact the project, we receive
              your username, message and any attachments you choose to send. We
              use them to respond, investigate problems and maintain the
              project. GitHub issues are public; do not post credentials or
              private personal information. The contact page does not currently
              submit messages.
            </p>
            <p>
              Azuria does not include launcher analytics, automatically upload
              your game logs, sell personal information or include targeted
              advertising in the launcher.
            </p>
          </section>
          <section id="website-data">
            <h2>3. Website, cookies and advertising</h2>
            <p>
              This website does not provide user accounts. Fonts and images are
              hosted with the website. Hosting and download providers process
              technical request information, including IP addresses, browser
              details and requested pages, to deliver and protect their
              services. The main website uses
              <a href="https://vercel.com/legal/privacy-notice">Vercel</a>;
              copies served through GitHub Pages and downloads use
              <a
                href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                >GitHub</a
              >. Your browser also requests the latest published release from
              GitHub’s public API.
            </p>
            <p>
              ${adsense ? `This website displays Google AdSense ads on its home page. Google and its partners may use cookies and process IP addresses, device information and browsing activity to deliver and measure ads. Where required, optional advertising processing depends on your consent. Use the consent message and its privacy controls to accept, reject, change or withdraw your choices. See <a href="https://policies.google.com/technologies/partner-sites">how Google uses information from partner sites</a>. Website advertising is separate from the Windows launcher.` : "This website does not currently set its own cookies or include analytics, advertising trackers or embedded social feeds. Optional advertising must be disclosed and the required consent controls provided before it is enabled."}
            </p>
          </section>
          <section id="sharing">
            <h2>4. Service providers and sharing</h2>
            <p>
              Azuria connects to
              <a href="https://privacy.microsoft.com/privacystatement"
                >Microsoft/Mojang</a
              >, GitHub, selected mod-loader services,
              <a href="https://modrinth.com/legal/privacy">Modrinth</a>,
              <a href="https://www.curseforge.com/legal/privacy-policy"
                >CurseForge</a
              >
              and their download providers as needed for the features you use.
              CurseForge catalogue requests may pass through Azuria’s
              <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a
              >-hosted service to forward searches and content requests and
              prevent abuse. Microsoft tokens and game logs are not sent to this
              service.
            </p>
            <p>
              Optional
              <a href="https://discord.com/privacy">Discord</a> activity sends a
              generic Playing Minecraft status and start time to your local
              Discord client. Account, instance, world and server names are not
              included. You can turn this off in Azuria’s Privacy or Behaviour
              settings or Discord’s activity controls.
            </p>
            <p>
              Providers may process information outside your country. Their own
              policies explain their processing, retention and
              international-transfer arrangements. Information shared with the
              project is used for the purposes described here; we may also
              disclose it where required by law.
            </p>
          </section>
          <section id="retention">
            <h2>5. Storage, retention and legal bases</h2>
            <p>
              Local launcher files remain until you remove them. Signing out in
              Profile removes saved sign-in credentials. Uninstalling does not
              automatically delete instances, worlds, screenshots, logs, local
              trash or backups. Back up important files before deleting them.
            </p>
            <p>
              Support information is kept while needed to resolve enquiries,
              maintain the project or meet legal obligations. Public issue
              history may remain available through GitHub, and copies may exist
              outside our control. Providers retain their own request and
              security records under their policies.
            </p>
            <p>
              Where data protection law applies, we rely on legitimate interests
              in responding to support requests and operating secure, reliable
              project services. Where optional website advertising requires
              consent, that processing is based on your consent. Other providers
              explain their own legal bases in their policies.
            </p>
          </section>
          <section id="your-choices">
            <h2>6. Your choices and rights</h2>
            <p>
              You can browse without signing in. Launcher privacy settings
              control account reconnection, visible account details and optional
              Discord activity. First installation asks you to acknowledge the
              policy; automatic updates do not ask again. Acknowledgement is not
              consent to advertising, analytics or unrelated collection.
            </p>
            <p>
              Depending on applicable law, you may request access, correction,
              deletion, restriction or a copy of personal information held by
              the project, or object to its processing. Where processing relies
              on consent, you can withdraw it without affecting earlier lawful
              processing. We may need to verify your identity to handle a
              request. For information held independently by Microsoft or
              another provider, use that provider’s privacy process.
            </p>
            <p>
              Use the <a href="${link("contact/")}">contact page</a> to arrange
              a suitable route for a request without publishing private details.
              You may complain to your local data protection authority; UK users
              can contact the
              <a href="https://ico.org.uk/make-a-complaint/"
                >Information Commissioner’s Office</a
              >. Parents or guardians with concerns about a child’s information
              can use the same contact route.
            </p>
          </section>
          <section id="policy-changes">
            <h2>7. Changes and contact</h2>
            <p>
              We will publish revisions here with an updated date. Material
              changes to how personal information is used will be communicated
              before the new processing starts. A policy update does not itself
              give permission for new optional collection.
            </p>
            <p>
              For questions about this policy, visit
              <a href="${link("contact/")}">Contact Azuria</a>.
            </p>
          </section>
        </article>
      </div>`;
  if (page === "terms")
    content = html`<section class="page-intro container">
        <h1>Terms of service</h1>
        <p>
          Last updated: 19 October 2026. Please read these terms before using
          the Azuria website or launcher.
        </p>
      </section>
      <div class="container legal-layout">
        <nav class="legal-toc" aria-label="Terms sections">
          <a href="#terms-scope">About these terms</a
          ><a href="#terms-use">Using Azuria</a
          ><a href="#terms-conduct">Acceptable use</a
          ><a href="#terms-content">Content & ownership</a
          ><a href="#terms-third-parties">Third parties</a
          ><a href="#terms-updates">Updates & availability</a
          ><a href="#terms-rights">Your rights</a
          ><a href="#terms-contact">Changes & contact</a>
        </nav>
        <article class="legal-content">
          <section id="terms-scope">
            <h2>1. About these terms</h2>
            <p>
              These terms cover the Azuria website, launcher and
              project-operated content service, developed and maintained by
              Azuria Studios. By using these services, you agree to these terms.
              If you do not agree, stop using them. Our
              <a href="${link("privacy/")}">privacy policy</a>
              separately explains how information is handled.
            </p>
            <p>
              Azuria is an independent project, not an official Minecraft
              product. It is not affiliated with, approved by or endorsed by
              Mojang or Microsoft. Their names, trademarks and game assets
              belong to their respective owners.
            </p>
          </section>
          <section id="terms-use">
            <h2>2. Using Azuria</h2>
            <p>
              Current development builds are available without charge for
              Windows x64. Azuria does not provide a Minecraft licence or
              permission to bypass game ownership and account checks. You must
              have the rights needed to use Minecraft and any mods, modpacks or
              other content you install.
            </p>
            <p>
              Use an account you are authorised to access and keep your device
              and credentials secure. Follow Microsoft’s account requirements
              and any parental permissions that apply to you. You can stop using
              Azuria at any time. Signing out and uninstalling are separate from
              deleting local worlds and other files.
            </p>
          </section>
          <section id="terms-conduct">
            <h2>3. Acceptable use</h2>
            <p>
              Use Azuria lawfully and respect other people’s rights. Do not
              distribute malware, access accounts without permission, interfere
              with security controls or abuse the project’s or a provider’s
              services. Automated requests must respect service limits and
              provider rules.
            </p>
            <p>
              We may restrict access to project-operated online services where
              reasonably necessary to address abuse, protect security or comply
              with law. This does not transfer ownership of your local files or
              your Minecraft account to Azuria.
            </p>
          </section>
          <section id="terms-content">
            <h2>4. Content and ownership</h2>
            <p>
              Azuria branding, website content and software remain subject to
              their owners’ rights. Follow the licence supplied with a file,
              dependency or downloaded item. Access to a repository or download
              does not by itself grant permission to copy, redistribute or
              commercially reuse all project material. These terms do not
              override rights granted by a separate licence or applicable law.
            </p>
            <p>
              Your worlds, screenshots and other local creations remain yours,
              subject to any rights in third-party material they contain.
              Installing or using Azuria does not grant the project ownership of
              those files.
            </p>
          </section>
          <section id="terms-third-parties">
            <h2>5. Third-party content and services</h2>
            <p>
              Microsoft, Mojang, GitHub, mod loaders, Modrinth, CurseForge,
              Discord and other linked services operate independently. Their
              terms, licences, account requirements and privacy policies apply
              when you use them. Azuria cannot guarantee their availability or
              continued compatibility.
            </p>
            <p>
              Mods and modpacks are supplied by their authors and may change the
              game or access files on your device. Review their source and
              permissions, choose downloads carefully and keep backups.
              Availability in a catalogue does not make an item an Azuria-owned
              product or guarantee it is suitable for every setup.
            </p>
          </section>
          <section id="terms-updates">
            <h2>6. Downloads, updates and availability</h2>
            <p>
              Use the download links on this website for official releases. The
              launcher checks for and installs available updates automatically.
              Privacy acknowledgement is requested only on first installation;
              automatic updates do not request it again.
            </p>
            <p>
              Azuria remains in development. Features, system requirements and
              service availability may change, and builds may contain errors. We
              do not promise uninterrupted service, compatibility with every
              system or a completion date for planned features. The
              <a href="${link("changelog/")}">release notes</a> describe
              published changes. Keep backups of important worlds and files.
            </p>
          </section>
          <section id="terms-rights">
            <h2>7. Your rights and our responsibilities</h2>
            <p>
              To the extent permitted by law, development builds are provided as
              available without a guarantee of error-free operation. Nothing in
              these terms excludes or limits liability for fraud, death or
              personal injury caused by negligence, or any other liability that
              cannot lawfully be excluded. Your statutory rights, including
              applicable consumer rights, remain unaffected.
            </p>
          </section>
          <section id="terms-contact">
            <h2>8. Changes and contact</h2>
            <p>
              Revised terms will be published here with an updated date.
              Material changes will be brought to users’ attention before they
              take effect. Changes do not remove rights that have already
              arisen. If you no longer agree, you can stop using Azuria.
            </p>
            <p>
              For questions, support or concerns about these terms, visit
              <a href="${link("contact/")}">Contact Azuria</a>.
            </p>
          </section>
        </article>
      </div>`;
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
            Contact Azuria Studios through the public project on GitHub.
            Response times may vary.
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
          Azuria Studios for a suitable private contact route without posting
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
      <h1>Page not found.</h1>
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
        <link rel="stylesheet" href="${link("premium.css")}" />
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
