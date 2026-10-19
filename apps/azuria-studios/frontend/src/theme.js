// Run before styles load to avoid a flash when a saved light theme is restored.
try {
  document.documentElement.style.colorScheme =
    localStorage.getItem("azuria-studios.theme") === "light" ? "light" : "dark";
} catch {
  document.documentElement.style.colorScheme = "dark";
}
