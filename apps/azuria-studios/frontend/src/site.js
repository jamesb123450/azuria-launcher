const THEME_KEY = "azuria-studios.theme";
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
