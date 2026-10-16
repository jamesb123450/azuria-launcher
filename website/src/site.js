document.documentElement.classList.add("js");
// The site is readable without JavaScript. This adds navigation and screenshot controls only.
const menuButton = document.querySelector("[data-menu-toggle]");
const menu = document.querySelector("#site-navigation");
function closeMenu() {
  menuButton?.setAttribute("aria-expanded", "false");
  menu?.classList.remove("is-open");
}
menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menu?.classList.toggle("is-open", open);
});
menu?.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuButton?.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});
const screenshot = document.querySelector("[data-theme-preview]");
for (const button of document.querySelectorAll("[data-preview-image]")) {
  button.addEventListener("click", () => {
    if (!screenshot) return;
    screenshot.src = button.dataset.previewImage;
    screenshot.alt = button.dataset.previewAlt;
    for (const option of document.querySelectorAll("[data-preview-image]"))
      option.setAttribute("aria-pressed", String(option === button));
    const caption = document.querySelector("[data-preview-caption]");
    if (caption) caption.textContent = button.dataset.previewCaption;
  });
}
