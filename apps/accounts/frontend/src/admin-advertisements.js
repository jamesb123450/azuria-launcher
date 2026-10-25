const pages = [
  ["home", "Home"],
  ["library", "Saved profiles"],
  ["social", "Social"],
  ["monitor", "Game monitor"],
];
const localDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export async function advertisementsWorkspace({ client, ui }) {
  const { button, paragraph, fail, message } = ui;
  const root = document.createElement("section");
  root.className = "sponsor-workspace";
  const heading = (text) => {
    const h = document.createElement("h3");
    h.textContent = text;
    return h;
  };
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      if (error.code === "23P01")
        fail(
          "A selected slot already has an enabled campaign during these dates. Change its slots or dates, or pause the other campaign.",
        );
      if (error.code === "40001")
        fail(
          "Another administrator changed this advertisement. Copy your edits, then reopen it before saving.",
        );
      if (error.code === "42501")
        fail(
          "Verify your administrator access before continuing. Your form is still here.",
        );
      fail(
        "Could not save or load advertisements. Check the image, HTTPS link, slots and dates, and confirm the advertisements migration has been applied.",
      );
    }
    return data;
  }
  async function listing() {
    const ads = await rpc("sponsor_ads_admin_list");
    root.replaceChildren(
      heading("Advertisements"),
      paragraph(
        "Manage direct sponsors in the launcher. Choose the exact pages and positions for each campaign.",
      ),
      button("Create advertisement", () => editor(null), "primary"),
    );
    if (!ads.length)
      root.append(
        paragraph("No advertisements yet. Create a draft to get started."),
      );
    for (const ad of ads) {
      const item = document.createElement("article");
      item.className = "admin-panel";
      const now = Date.now();
      const state = !ad.enabled
        ? "Paused / draft"
        : Date.parse(ad.starts_at) > now
          ? "Scheduled"
          : ad.ends_at && Date.parse(ad.ends_at) <= now
            ? "Ended"
            : "Active";
      item.append(
        heading(ad.title),
        paragraph(
          `${state} · ${ad.slots.map((s) => s.replace(".", " · ")).join(", ")}`,
          "fine",
        ),
        button("Edit advertisement", () => editor(ad)),
      );
      root.append(item);
    }
  }
  function editor(saved) {
    let imagePath = saved?.image_path || "",
      dirty = false;
    const form = document.createElement("form");
    form.className = "news-editor";
    const mark = () => {
      dirty = true;
    };
    form.addEventListener("input", mark);
    function field(label, type, value = "") {
      const wrap = document.createElement("label");
      wrap.textContent = label;
      const input = document.createElement("input");
      input.type = type;
      input.value = value;
      wrap.append(input);
      form.append(wrap);
      return input;
    }
    root.replaceChildren(
      heading(saved ? "Edit advertisement" : "Create advertisement"),
      paragraph(
        "Dates use your local time zone. Campaigns end at the specified time; leave End blank to keep running.",
      ),
      form,
    );
    const title = field("Sponsor / campaign name", "text", saved?.title);
    title.required = true;
    title.maxLength = 100;
    const destination = field(
      "Destination URL · HTTPS",
      "url",
      saved?.destination,
    );
    destination.required = true;
    destination.maxLength = 2048;
    const alt = field("Image description", "text", saved?.image_alt);
    alt.required = true;
    alt.maxLength = 240;
    const file = field(
      "Sponsor artwork · square JPG, PNG or WebP, up to 2 MB",
      "file",
    );
    file.accept = "image/jpeg,image/png,image/webp";
    const preview = document.createElement("img");
    preview.className = "sponsor-upload-preview";
    preview.alt = "Sponsor artwork preview";
    preview.hidden = !imagePath;
    function imageURL(path) {
      return client.storage.from("sponsor-images").getPublicUrl(path).data
        .publicUrl;
    }
    if (imagePath) preview.src = imageURL(imagePath);
    const upload = button("Upload artwork", async () => {
      const image = file.files?.[0];
      const ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      }[image?.type];
      if (!image || !ext || !image.size || image.size > 2097152)
        fail("Choose a JPG, PNG or WebP image up to 2 MB.");
      let bitmap;
      try {
        bitmap = await createImageBitmap(image);
      } catch {
        fail("This file is not a readable image.");
      }
      const square = bitmap.width === bitmap.height;
      bitmap.close();
      if (!square)
        fail(
          "Use a square image so the artwork fits without cropping. 600 × 600 pixels works well.",
        );
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) fail("Verify admin access before uploading.");
      const path = `${data.user.id}/${crypto.randomUUID()}.${ext}`;
      const result = await client.storage
        .from("sponsor-images")
        .upload(path, image, { contentType: image.type, upsert: false });
      if (result.error)
        fail(
          "Upload failed. Check admin access and the sponsor-images storage setup.",
        );
      imagePath = path;
      preview.src = imageURL(path);
      preview.hidden = false;
      dirty = true;
      message("Artwork uploaded. Save the advertisement to use it.");
    });
    form.append(
      upload,
      preview,
      paragraph(
        "Uploaded artwork has a public URL. Upload only images you have permission to publish.",
        "fine",
      ),
    );
    const start = field(
      "Start",
      "datetime-local",
      localDate(saved?.starts_at || new Date().toISOString()),
    );
    start.required = true;
    const end = field(
      "End · optional",
      "datetime-local",
      localDate(saved?.ends_at),
    );
    const enabledLabel = document.createElement("label");
    enabledLabel.className = "sponsor-enabled";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = saved?.enabled || false;
    enabledLabel.append(enabled, "Enable campaign");
    form.append(enabledLabel);
    const slots = document.createElement("fieldset");
    slots.className = "sponsor-slot-picker";
    const legend = document.createElement("legend");
    legend.textContent = "Choose placements · select one or more";
    slots.append(legend);
    const choices = [];
    for (const [page, name] of pages) {
      const card = document.createElement("section");
      card.className = "sponsor-page-preview";
      card.append(heading(name));
      for (const [position, label] of [
        ["top", "Upper square"],
        ["bottom", "Lower square"],
      ]) {
        const wrap = document.createElement("label");
        wrap.className = "sponsor-slot-choice";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = `${page}.${position}`;
        input.checked = saved?.slots.includes(input.value) || false;
        const text = document.createElement("span");
        text.textContent = label;
        wrap.append(input, text);
        card.append(wrap);
        choices.push(input);
      }
      slots.append(card);
    }
    form.append(slots);
    form.append(
      paragraph(
        "Upper and lower refer to the two square advertisements in that page’s right sidebar. The same campaign can occupy several slots. Overlapping enabled campaigns cannot share a slot.",
        "fine",
      ),
    );
    const save = button(
      "Save advertisement",
      async () => {
        if (!form.reportValidity()) return;
        let link;
        try {
          link = new URL(destination.value);
        } catch {
          fail("Enter a valid HTTPS destination.");
        }
        if (
          link.protocol !== "https:" ||
          link.username ||
          link.password ||
          link.port
        )
          fail("Use an HTTPS link without credentials or a custom port.");
        const selected = choices.filter((c) => c.checked).map((c) => c.value);
        if (!imagePath || !selected.length)
          fail("Upload artwork and select at least one placement.");
        if (end.value && Date.parse(end.value) <= Date.parse(start.value))
          fail("End must be after Start.");
        await rpc("sponsor_ads_admin_save", {
          p_ad: {
            title: title.value.trim(),
            image_path: imagePath,
            image_alt: alt.value.trim(),
            destination: link.href,
            slots: selected,
            enabled: enabled.checked,
            starts_at: new Date(start.value).toISOString(),
            ends_at: end.value ? new Date(end.value).toISOString() : null,
          },
          p_id: saved?.id || null,
          p_revision: saved?.revision || null,
        });
        dirty = false;
        message("Advertisement saved.");
        await listing();
      },
      "primary",
    );
    form.append(
      save,
      button("Back to advertisements", async () => {
        if (!dirty || confirm("Discard unsaved advertisement changes?"))
          await listing();
      }),
    );
  }
  await listing();
  return root;
}
