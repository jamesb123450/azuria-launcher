// Presentation only: release URLs and notes are validated by the shared page renderer.
export function renderHomepage({
  asset,
  link,
  download,
  icon,
  releases,
  releaseURL,
  escapeHTML: e,
  safeReleaseURL,
  date,
  html,
}) {
  const shot = (name, alt, extra = "") =>
    html`<figure class="product-shot" ${extra}>
      <img
        src="${asset(name)}"
        width="1280"
        height="900"
        loading="lazy"
        alt="${alt}"
      />
    </figure>`;
  const summary = (release) =>
    (release.notes || "")
      .split(/\r?\n/)
      .find((line) => line.startsWith("- "))
      ?.slice(2) || "Read the published release notes.";
  return html`<div class="premium-home">
    <section class="premium-hero" aria-labelledby="hero-heading">
      <img
        class="premium-scenery"
        src="${asset("minecraft-cherry-grove.webp")}"
        width="1920"
        height="1080"
        alt=""
        aria-hidden="true"
      />
      <div class="container premium-hero-content">
        <img
          class="premium-mark"
          src="${asset("azuria.png")}"
          width="104"
          height="104"
          alt=""
        />
        <p class="premium-kicker">Azuria Launcher · By Azuria Studios</p>
        <h1 id="hero-heading">
          Your Minecraft.<span>Beautifully organised.</span>
        </h1>
        <p class="premium-lead">
          Keep your Minecraft versions, mods and worlds<br
            class="desktop-break"
          />
          together in one launcher.
        </p>
        <div class="premium-actions">
          ${download("Download for Windows")}<a
            class="quiet-link"
            href="#features"
            >Explore the launcher ${icon("arrow", 17)}</a
          >
        </div>
        <p class="premium-status">
          Development preview · Windows x64 · Minecraft Java Edition<br />Vanilla
          &amp; Fabric launching ·
          <a href="${link("help/")}#status">Current status</a>
        </p>
        <figure class="hero-shot">
          <img
            src="${asset("library.webp")}"
            width="1280"
            height="900"
            fetchpriority="high"
            alt="Azuria’s current instance library with sample Vanilla and Fabric setups and a demo account."
          />
          <figcaption>
            Current launcher interface · Sample library and demo account
          </figcaption>
        </figure>
      </div>
    </section>
    <div
      class="premium-capabilities container"
      aria-label="Launcher highlights"
    >
      <span>${icon("layers", 18)}Separate instances</span
      ><span>${icon("check", 18)}Mods &amp; modpacks</span
      ><span>${icon("sun", 18)}Your appearance</span>
    </div>
    <section
      id="features"
      class="premium-section"
      aria-labelledby="library-heading"
    >
      <div class="container premium-split" data-reveal>
        <div class="section-intro">
          <p class="premium-kicker">Your instances</p>
          <h2 id="library-heading">Keep your setups<br />organised.</h2>
          <p>
            A vanilla world, a Fabric setup, or a modpack for your next weekend.
            Keep each instance organised, with its own versions and settings.
          </p>
          <ul class="premium-checks">
            <li>Search, group and favourite your instances</li>
            <li>Keep versions and settings separate</li>
            <li>Open content, worlds and live logs in one place</li>
          </ul>
        </div>
        ${shot("instance.webp", "Azuria instance details with game, content, screenshot and log controls.")}
      </div>
    </section>
    <section
      class="premium-section premium-discover"
      aria-labelledby="content-heading"
    >
      <div class="container">
        <div class="premium-section-top" data-reveal>
          <div>
            <p class="premium-kicker">Mods and modpacks</p>
            <h2 id="content-heading">Find mods for<br />your next setup.</h2>
          </div>
          <p>
            Browse projects from Modrinth and CurseForge. Check what is
            supported before installing.
          </p>
        </div>
        <div class="premium-providers">
          <article data-reveal>
            <img
              class="provider-icon"
              src="${asset("modrinth.svg")}"
              width="44"
              height="44"
              alt=""
              loading="lazy"
            />
            <div>
              <h3>Modrinth</h3>
              <p>
                Find community mods, modpacks and resource packs on Modrinth.
              </p>
            </div>
          </article>
          <article data-reveal>
            <img
              class="provider-icon"
              src="${asset("curseforge.svg")}"
              width="44"
              height="44"
              alt=""
              loading="lazy"
            />
            <div>
              <h3>CurseForge</h3>
              <p>
                Browse CurseForge projects. Some downloads may need to be opened
                on the CurseForge website.
              </p>
            </div>
          </article>
        </div>
        <div class="premium-split premium-reverse" data-reveal>
          <div>
            <h3>Choose a version and get started.</h3>
            <p>
              Create your next setup and keep compatible content alongside the
              instance it belongs to. Vanilla and Fabric launching are
              supported; other loaders remain in development.
            </p>
            <a class="text-link" href="${link("help/")}"
              >See supported features ${icon("arrow", 17)}</a
            >
          </div>
          ${shot("create.webp", "Azuria’s instance creation screen with its Custom setup option.")}
        </div>
      </div>
    </section>
    <section
      id="appearance"
      class="premium-section premium-appearance"
      aria-labelledby="appearance-heading"
    >
      <div class="container">
        <div class="premium-section-top" data-reveal>
          <div>
            <p class="premium-kicker">Launcher appearance</p>
            <h2 id="appearance-heading">Choose your<br />appearance.</h2>
          </div>
          <p>
            Choose dark, light or OLED in the launcher. Try the dark and light
            previews below.
          </p>
        </div>
        <div
          class="preview-switch"
          role="group"
          aria-label="Launcher appearance preview"
        >
          <button
            type="button"
            aria-pressed="true"
            data-preview-image="${asset("library.webp")}"
            data-preview-alt="Azuria’s dark library with sample instance configurations."
            data-preview-caption="Dark launcher appearance"
          >
            Dark</button
          ><button
            type="button"
            aria-pressed="false"
            data-preview-image="${asset("library-light.webp")}"
            data-preview-alt="Azuria’s light library with the same sample instances."
            data-preview-caption="Light launcher appearance"
          >
            Light
          </button>
        </div>
        <figure class="premium-appearance-shot" data-reveal>
          <div class="preview-stack">
            <img
              data-theme-preview
              src="${asset("library.webp")}"
              width="1280"
              height="900"
              loading="lazy"
              alt="Azuria’s dark library with sample instance configurations."
            />
          </div>
          <figcaption data-preview-caption aria-live="polite">
            Dark launcher appearance
          </figcaption>
        </figure>
        <p class="small-note preview-note">
          Switch the launcher screenshot above; the website keeps its dark
          appearance.
        </p>
        <p class="preview-status" data-preview-status role="status"></p>
      </div>
    </section>
    <section class="premium-section" aria-labelledby="skins-heading">
      <div class="container premium-split" data-reveal>
        <div>
          <p class="premium-kicker">Skins and capes</p>
          <h2 id="skins-heading">Your skins,<br />ready to use.</h2>
          <p>
            Save skins on your computer, preview your character and choose from
            the skins and capes available to your account.
          </p>
          <p class="small-note">
            Official Steve texture and a demo account shown. Cape choices depend
            on your account.
          </p>
        </div>
        ${shot("skins.webp", "Azuria skin selector with a Steve character preview and saved skin collection.")}
      </div>
    </section>
    <section class="premium-section" aria-labelledby="settings-heading">
      <div class="container premium-split premium-reverse" data-reveal>
        <div>
          <p class="premium-kicker">Settings</p>
          <h2 id="settings-heading">Set it up<br />your way.</h2>
          <p>
            Set Java, memory and window preferences, then tailor individual
            instances when they need something different.
          </p>
          <p>
            Save your changes when you’re ready, or reset them to start again.
          </p>
        </div>
        ${shot("settings.webp", "Azuria’s settings popup with category navigation and appearance controls.")}
      </div>
    </section>
    <section class="premium-section" aria-labelledby="steps-heading">
      <div class="container">
        <div class="premium-center" data-reveal>
          <p class="premium-kicker">Getting started</p>
          <h2 id="steps-heading">
            Your next instance,<br />in a few simple steps.
          </h2>
        </div>
        <ol class="premium-steps">
          <li data-reveal>
            <span>Step 1</span>
            <h3>Install Azuria.</h3>
            <p>Download the Windows installer and open your new launcher.</p>
          </li>
          <li data-reveal>
            <span>Step 2</span>
            <h3>Pick your version.</h3>
            <p>Create a Vanilla or Fabric instance and choose your settings.</p>
          </li>
          <li data-reveal>
            <span>Step 3</span>
            <h3>Start your next world.</h3>
            <p>
              Sign in with an account that owns Minecraft Java Edition, then
              launch when ready.
            </p>
          </li>
        </ol>
      </div>
    </section>
    <section
      id="updates"
      class="premium-section updates-section"
      aria-labelledby="updates-heading"
    >
      <div class="container">
        <div class="premium-section-top" data-reveal>
          <div>
            <p class="premium-kicker">Updates</p>
            <h2 id="updates-heading">Latest releases.</h2>
          </div>
          <a class="text-link" href="${link("changelog/")}"
            >Full changelog ${icon("arrow", 17)}</a
          >
        </div>
        <div class="update-grid">
          ${releases
            .slice(0, 3)
            .map(
              (release, index) =>
                html`<article
                  class="update-card"
                  data-reveal
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
        <p class="small-note">
          Already using Azuria? Signed updates are checked automatically at
          startup.
        </p>
      </div>
    </section>
    <section
      class="premium-final"
      aria-labelledby="download-heading"
      data-reveal
    >
      <div class="container">
        <img src="${asset("azuria.png")}" width="84" height="84" alt="" />
        <p class="premium-kicker">Azuria Launcher</p>
        <h2 id="download-heading">Ready to play?</h2>
        <div class="premium-actions">${download("Download Azuria")}</div>
        <p class="premium-status">
          Windows x64 · Development preview ·
          <a href="${link("downloads/")}">Requirements &amp; installation</a>
        </p>
      </div>
    </section>
  </div>`;
}
