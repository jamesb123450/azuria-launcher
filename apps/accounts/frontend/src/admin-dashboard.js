export const adminSections = [
  { id: "overview", label: "Overview", group: "Workspace", icon: "overview" },
  { id: "accounts", label: "Accounts", group: "Workspace", icon: "users" },
  {
    id: "activity",
    label: "Activity log",
    group: "Workspace",
    icon: "activity",
  },
  {
    id: "reports",
    label: "Reports",
    group: "Manage",
    icon: "shield",
    soon: true,
  },
  {
    id: "products",
    label: "Products",
    group: "Manage",
    icon: "grid",
    soon: true,
  },
  {
    id: "announcements",
    label: "Announcements",
    group: "Manage",
    icon: "speaker",
    soon: true,
  },
  {
    id: "analytics",
    label: "Analytics",
    group: "Insights",
    icon: "chart",
    soon: true,
  },
  {
    id: "settings",
    label: "Settings",
    group: "Insights",
    icon: "settings",
    soon: true,
  },
];
export const plannedTools = {
  reports: {
    title: "Reports",
    description: "A place to review reports and follow up on account issues.",
    tools: [
      ["Report queue", "Review reports submitted by players.", "Open queue"],
      [
        "Case notes",
        "Keep the context and outcome of each report together.",
        "View cases",
      ],
      [
        "Moderation rules",
        "Set clear rules for handling reports.",
        "Manage rules",
      ],
    ],
  },
  products: {
    title: "Products",
    description: "Manage the things Azuria Studios builds, all in one place.",
    tools: [
      [
        "Azuria Launcher",
        "Manage release details and supported versions.",
        "Manage launcher",
      ],
      [
        "Websites",
        "Manage links and details for Azuria websites.",
        "Manage websites",
      ],
      [
        "New projects",
        "Prepare a new product before it is announced.",
        "Add project",
      ],
    ],
  },
  announcements: {
    title: "Announcements",
    description: "Prepare updates for the launcher and Azuria websites.",
    tools: [
      [
        "Write an announcement",
        "Draft news and choose where it will appear.",
        "Create draft",
      ],
      [
        "Scheduled posts",
        "Choose when an announcement goes live.",
        "View schedule",
      ],
      [
        "Launcher news",
        "Manage the news shown on the launcher home page.",
        "Manage news",
      ],
    ],
  },
  analytics: {
    title: "Analytics",
    description:
      "Understand how people use Azuria once reporting is connected.",
    tools: [
      ["Account growth", "See registrations over time.", "View growth"],
      [
        "Launcher activity",
        "See usage trends when measurement is available.",
        "View activity",
      ],
      [
        "Website traffic",
        "Bring website reporting into this dashboard.",
        "Connect reporting",
      ],
    ],
  },
  settings: {
    title: "Settings",
    description: "Future controls for the wider Azuria workspace.",
    tools: [
      [
        "Team access",
        "Manage staff access when role management is available.",
        "Manage team",
      ],
      [
        "Service connections",
        "Review the services connected to Azuria.",
        "View connections",
      ],
      [
        "Workspace details",
        "Manage branding and public contact details.",
        "Edit details",
      ],
    ],
  },
};
export function selectedAdminSection(hash) {
  const id = hash.replace(/^#/, "");
  return adminSections.some((section) => section.id === id) ? id : "overview";
}
export function adminIcon(name) {
  const paths = {
    overview: [
      "M3 3h7v7H3z",
      "M14 3h7v7h-7z",
      "M3 14h7v7H3z",
      "M14 14h7v7h-7z",
    ],
    users: [
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
      "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
      "M20 21v-2a4 4 0 0 0-3-3.87",
      "M16 3.13a4 4 0 0 1 0 7.75",
    ],
    activity: ["M3 12h4l3-8 4 16 3-8h4"],
    shield: ["M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z", "M12 8v5", "M12 17h.01"],
    grid: ["M12 3 3 8l9 5 9-5z", "M3 12l9 5 9-5", "M3 16l9 5 9-5"],
    speaker: ["M3 10v4h5l10 5V5L8 10z", "M8 14l2 7", "M21 9v6"],
    chart: ["M4 3v18h17", "M9 16v-5", "M14 16V7", "M19 16v-8"],
    settings: ["M4 7h16", "M4 17h16", "M8 4v6", "M16 14v6"],
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.6",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(key, value);
  for (const d of paths[name] || paths.grid) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
