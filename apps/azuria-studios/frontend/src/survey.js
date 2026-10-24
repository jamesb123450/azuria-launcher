import { survey } from "./survey-definition.mjs";
const config = document.querySelector("#feedback-config")?.dataset;
const form = document.querySelector("#feedback-form");
const status = document.querySelector("#feedback-status");
const send = document.querySelector("#feedback-send");
let widget,
  token = "",
  pending = false;
const storageKey = "azuria-studios.feedback.v1";
const remember = (value) => {
  try {
    localStorage.setItem(storageKey, value);
  } catch {}
};
if (form) {
  const questions = document.querySelector("#feedback-questions");
  for (const [index, question] of survey.questions.entries()) {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `${index + 1}. ${question.title}`;
    const hint = document.createElement("p");
    hint.className = "survey-hint";
    hint.textContent = "Select all that apply.";
    const options = document.createElement("div");
    options.className = "survey-options";
    for (const [id, text] of question.options) {
      const label = document.createElement("label"),
        input = document.createElement("input"),
        span = document.createElement("span");
      input.type = "checkbox";
      input.name = question.id;
      input.value = id;
      span.textContent = text;
      label.append(input, span);
      options.append(label);
    }
    fieldset.append(legend, hint, options);
    questions.append(fieldset);
  }
  let submissionId;
  const resetChallenge = () => {
    token = "";
    if (widget !== undefined) window.turnstile?.reset(widget);
  };
  const configured = config?.url && config?.key && config?.sitekey;
  if (!configured) {
    status.textContent =
      "The survey is not accepting responses yet. Please check back soon.";
    send.disabled = true;
  } else {
    window.azuriaFeedbackReady = () => {
      widget = window.turnstile.render("#feedback-challenge", {
        sitekey: config.sitekey,
        action: "launcher_feedback",
        callback: (value) => {
          token = value;
        },
        "expired-callback": () => {
          token = "";
        },
        "error-callback": () => {
          token = "";
          status.textContent =
            "The bot check could not load. Please reload the page and try again.";
        },
      });
    };
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=azuriaFeedbackReady&render=explicit";
    script.async = true;
    script.onerror = () => {
      status.textContent =
        "The bot check could not load. Please reload the page and try again.";
    };
    document.head.append(script);
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending || !configured) return;
    const answers = {};
    for (const question of survey.questions) {
      answers[question.id] = [
        ...form.querySelectorAll(`input[name="${question.id}"]:checked`),
      ].map((input) => input.value);
      if (!answers[question.id].length) {
        status.textContent =
          "Please choose at least one answer for each question.";
        form.querySelector(`input[name="${question.id}"]`).focus();
        return;
      }
    }
    if (!token) {
      status.textContent =
        "Please complete the bot check before sending your answers.";
      return;
    }
    submissionId ||= crypto.randomUUID();
    pending = true;
    send.disabled = true;
    status.textContent = "Sending your answers…";
    try {
      const response = await fetch(
        `${config.url}/functions/v1/feedback-submit`,
        {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json", apikey: config.key },
          body: JSON.stringify({
            version: survey.version,
            submissionId,
            answers,
            token,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) throw new Error("unavailable");
      const result = await response.json();
      if (result?.success !== true) throw new Error("unavailable");
      remember("completed");
      form.hidden = true;
      const thanks = document.querySelector("#feedback-thanks");
      thanks.hidden = false;
      thanks.focus();
    } catch {
      status.textContent =
        "Your answers could not be confirmed. They are still here. Complete the bot check again, then try sending once more.";
      resetChallenge();
    } finally {
      pending = false;
      send.disabled = false;
    }
  });
}
// Invite on the home page only. Legal pages and the survey remain interruption-free.
if (location.pathname === "/") {
  let seen;
  try {
    seen = localStorage.getItem(storageKey);
  } catch {}
  if (!seen) {
    const dialog = document.createElement("dialog");
    dialog.className = "survey-invite";
    dialog.setAttribute("aria-labelledby", "feedback-invite-title");
    dialog.innerHTML =
      '<p class="survey-eyebrow">HELP SHAPE AZURIA</p><h2 id="feedback-invite-title">What makes a great launcher?</h2><p>Tell us what you like, what gets in your way, and what you’d like to see in Azuria Launcher.</p><div class="survey-invite-actions"><a class="survey-primary" href="/survey/">Yes, give feedback</a><button type="button">No thanks</button></div><small>All answers are anonymous and data is held in accordance with our <a href="/privacy/">privacy policy</a>.</small>';
    document.querySelector("#azuria-studio-preview").append(dialog);
    const dismiss = () => {
      remember("dismissed");
      dialog.close();
    };
    dialog.querySelector("button").addEventListener("click", dismiss);
    dialog.addEventListener("cancel", () => remember("dismissed"));
    dialog
      .querySelector(".survey-primary")
      .addEventListener("click", () => remember("invited"));
    // Let the privacy choice be made first, so two prompts never compete.
    const invite = () => {
      const banner = document.querySelector(".analytics-banner");
      if (banner && !banner.hidden) return false;
      dialog.showModal();
      return true;
    };
    requestAnimationFrame(() => {
      if (!invite()) {
        const banner = document.querySelector(".analytics-banner");
        const observer = new MutationObserver(() => {
          if (invite()) observer.disconnect();
        });
        observer.observe(banner, {
          attributes: true,
          attributeFilter: ["hidden"],
        });
      }
    });
  }
}
