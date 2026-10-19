const CONSENT_KEY = "azuria-studios.cookies.v1";
const THEME_KEY = "azuria-studios.theme";
const lifetime = 180 * 24 * 60 * 60 * 1000;
const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Keep the site usable when storage is blocked. */
  }
};
const themeButton = document.querySelector(".as-theme");
const root = document.documentElement;
const applyTheme = (theme) => {
  root.style.colorScheme = theme;
  themeButton.setAttribute("aria-pressed", String(theme === "light"));
  themeButton.setAttribute(
    "aria-label",
    `Switch to ${theme === "light" ? "dark" : "light"} theme`,
  );
};
const savedTheme = read(THEME_KEY);
applyTheme(savedTheme === "light" ? "light" : "dark");
themeButton.addEventListener("click", () => {
  const theme = root.style.colorScheme === "dark" ? "light" : "dark";
  applyTheme(theme);
  write(THEME_KEY, theme);
});
const banner = document.querySelector(".cookie-banner");
let returnFocus;
const validChoice = () => {
  try {
    const value = JSON.parse(read(CONSENT_KEY));
    return (
      value &&
      ["accepted", "rejected"].includes(value.choice) &&
      value.at <= Date.now() &&
      Date.now() - value.at < lifetime
    );
  } catch {
    return false;
  }
};
banner.hidden = Boolean(validChoice());
document.querySelectorAll(".cookie-settings").forEach((button) =>
  button.addEventListener("click", () => {
    returnFocus = button;
    banner.hidden = false;
    banner.querySelector("button").focus();
  }),
);
banner.querySelectorAll("[data-cookie-choice]").forEach((button) =>
  button.addEventListener("click", () => {
    write(
      CONSENT_KEY,
      JSON.stringify({ choice: button.dataset.cookieChoice, at: Date.now() }),
    );
    banner.hidden = true;
    (returnFocus || document.querySelector(".cookie-settings")).focus();
    document.querySelector(".site-announcement").textContent =
      "Your cookie preferences have been saved.";
  }),
);
