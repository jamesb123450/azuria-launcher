import { newsArticle } from "../../../frontend/src/news-model.mjs";

// Kept in memory across admin re-verification, never in browser storage.
let unsaved = null;
globalThis.addEventListener?.("beforeunload", (event) => {
  if (unsaved) {
    event.preventDefault();
    event.returnValue = "";
  }
});
export async function newsWorkspace({ client, ui }) {
  const { button, paragraph, fail, message } = ui;
  const root = document.createElement("section");
  root.className = "news-workspace";
  let offset = 0,
    saved = null;
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      if (error.code === "42501")
        fail(
          "Your draft has been kept. Verify admin access, then return to News.",
        );
      if (error.code === "40001")
        fail(
          "Another admin changed this story. Copy your text, then reopen the story before saving.",
        );
      if (error.code === "23505")
        fail("That page address is already in use. Choose another.");
      if (["23514", "23502", "22023"].includes(error.code))
        fail(
          "Check the page address, title and image. Publishing also needs image description and article text.",
        );
      fail(
        "Could not save or load news. Check the news database setup and try again.",
      );
    }
    return data;
  }
  function heading(text) {
    const h = document.createElement("h3");
    h.textContent = text;
    return h;
  }
  function row(...nodes) {
    const div = document.createElement("div");
    div.className = "row";
    div.append(...nodes);
    return div;
  }
  async function listing() {
    const posts = await rpc("news_admin_list", { p_offset: offset });
    root.replaceChildren(
      row(
        heading("News"),
        button("Create story", () => editor(null), "primary"),
      ),
      paragraph(
        "Draft, preview and publish updates for the website and launcher.",
      ),
    );
    if (unsaved)
      root.append(button("Continue unsaved draft", () => editor(unsaved)));
    if (!posts.length)
      root.append(paragraph("No stories here yet. Create your first update."));
    for (const post of posts) {
      const item = document.createElement("div");
      item.className = "admin-panel news-list-row";
      item.append(
        heading(post.title),
        paragraph(
          `${post.status === "published" ? "Published" : "Draft"} · ${post.author_username} · Updated ${new Date(post.updated_at).toLocaleDateString()}`,
          "fine",
        ),
        button("Edit story", () => editor(post)),
      );
      root.append(item);
    }
    const pages = row();
    if (offset)
      pages.append(
        button("Newer stories", async () => {
          offset -= 25;
          await listing();
        }),
      );
    if (posts.length === 25 && offset < 10000)
      pages.append(
        button("Older stories", async () => {
          offset += 25;
          await listing();
        }),
      );
    root.append(pages);
  }
  async function editor(post) {
    const resuming = post === unsaved;
    if (
      unsaved &&
      !resuming &&
      !confirm("Replace your unsaved draft in this tab?")
    )
      return;
    saved = post?.id ? { ...post } : null;
    const draft = {
      ...{
        slug: "",
        title: "",
        summary: "",
        body: "",
        cover_path: "",
        cover_alt: "",
        accent: "pink",
        image_position: "center",
        reading_width: "comfortable",
        status: "draft",
      },
      ...post,
    };
    unsaved = resuming ? draft : null;
    const form = document.createElement("form");
    form.className = "news-editor";
    const fields = {};
    function input(name, label, { max, area = false, choices } = {}) {
      const wrap = document.createElement("label");
      wrap.textContent = label;
      const control = document.createElement(
        choices ? "select" : area ? "textarea" : "input",
      );
      control.name = name;
      if (choices)
        for (const [value, text] of choices) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = text;
          control.append(option);
        }
      else {
        control.maxLength = max;
        if (area) control.rows = name === "body" ? 16 : 3;
      }
      control.value = draft[name];
      fields[name] = control;
      control.addEventListener("input", () => {
        draft[name] = control.value;
        unsaved = draft;
        refresh();
      });
      wrap.append(control);
      form.append(wrap);
      return control;
    }
    input("title", "Title", { max: 160 });
    const slug = input(
      "slug",
      "Page address (lowercase words separated by hyphens)",
      { max: 100 },
    );
    slug.pattern = "[a-z0-9]+(-[a-z0-9]+)*";
    slug.minLength = 3;
    slug.required = true;
    fields.title.required = true;
    if (saved?.status === "published") {
      slug.readOnly = true;
      slug.title = "Unpublish before changing the address";
    }
    input("summary", "Card summary", { max: 320, area: true });
    const uploadLabel = document.createElement("label");
    uploadLabel.textContent = "Cover image · JPG, PNG or WebP, up to 5 MB";
    const upload = document.createElement("input");
    upload.type = "file";
    upload.accept = "image/jpeg,image/png,image/webp";
    uploadLabel.append(upload);
    const uploadButton = button("Upload cover", async () => {
      const file = upload.files?.[0];
      const ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      }[file?.type];
      if (!file || !ext || file.size > 5242880 || file.size === 0)
        fail("Choose a JPG, PNG or WebP image under 5 MB.");
      try {
        const bitmap = await createImageBitmap(file);
        bitmap.close();
      } catch {
        fail("This file is not a readable image. Choose another.");
      }
      const { data: identity, error: identityError } =
        await client.auth.getUser();
      if (identityError || !identity.user)
        fail("Verify admin access before uploading.");
      const path = `${identity.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await client.storage
        .from("news-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error)
        fail(
          "Image upload failed. Check admin access and the news storage setup, then try again.",
        );
      draft.cover_path = path;
      unsaved = draft;
      refresh();
      message("Cover uploaded. Save the story to use it.");
    });
    form.append(
      uploadLabel,
      uploadButton,
      paragraph(
        "Upload only images you have permission to publish. Uploaded images use public URLs.",
        "fine",
      ),
    );
    input("cover_alt", "Image description", { max: 240 });
    input("image_position", "Image framing", {
      choices: [
        ["top", "Top"],
        ["center", "Centre"],
        ["bottom", "Bottom"],
      ],
    });
    input("accent", "Accent colour", {
      choices: [
        ["pink", "Azuria pink"],
        ["blue", "Azuria blue"],
        ["violet", "Violet"],
      ],
    });
    input("reading_width", "Reading width", {
      choices: [
        ["comfortable", "Comfortable"],
        ["wide", "Wide"],
      ],
    });
    input("body", "Article text", { max: 100000, area: true });
    form.append(
      paragraph(
        "Separate paragraphs with a blank line. Use #, ## or ### for headings and - for lists. HTML is displayed as text.",
        "fine",
      ),
    );
    const preview = document.createElement("div");
    preview.className = "news-editor-preview";
    function refresh() {
      preview.replaceChildren(
        newsArticle(draft, import.meta.env.VITE_SUPABASE_URL, {
          preview: true,
        }),
      );
    }
    async function save(status) {
      if (!form.reportValidity()) return;
      if (
        status === "published" &&
        (!draft.cover_path || !draft.cover_alt.trim() || !draft.body.trim())
      )
        fail(
          "Add a cover image, its description and article text before publishing.",
        );
      const payload = Object.fromEntries(
        [
          "slug",
          "title",
          "summary",
          "body",
          "cover_path",
          "cover_alt",
          "accent",
          "image_position",
          "reading_width",
        ].map((key) => [key, draft[key]]),
      );
      payload.status = status;
      const controls = [...form.querySelectorAll("input,textarea,select")];
      controls.forEach((control) => {
        control.disabled = true;
      });
      try {
        const result = await rpc("news_admin_save", {
          p_post: payload,
          p_id: saved?.id ?? null,
          p_revision: saved?.revision ?? null,
        });
        const record = Array.isArray(result) ? result[0] : result;
        if (!record?.id)
          fail(
            "Could not confirm the save. Your text has been kept; check the story list before trying again.",
          );
        unsaved = null;
        await editor(record);
        message(
          status === "published"
            ? "Published. The website and launcher will show this story when refreshed."
            : "Draft saved. It is hidden from readers.",
        );
      } finally {
        controls.forEach((control) => {
          control.disabled = false;
        });
      }
    }
    const actions = row(
      button(
        saved?.status === "published" ? "Save changes" : "Publish",
        () => save("published"),
        "primary",
      ),
      button(saved?.status === "published" ? "Unpublish" : "Save draft", () =>
        save("draft"),
      ),
      button(
        "Back to stories",
        async () => {
          if (
            unsaved &&
            !confirm(
              "Leave the editor? Your unsaved draft will stay in this tab until you close it.",
            )
          )
            return;
          await listing();
        },
        "text-button",
      ),
    );
    if (saved?.status === "published") {
      const link = document.createElement("a");
      link.href = `https://launcher.azuriasmp.org/news/?story=${encodeURIComponent(saved.slug)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View published page";
      actions.append(link);
    }
    form.addEventListener("submit", (event) => event.preventDefault());
    root.replaceChildren(
      heading(saved ? "Edit story" : "Create story"),
      paragraph(
        "Preview the full page below. Changes appear publicly only after you save or publish.",
      ),
      form,
      actions,
      heading("Page preview"),
      preview,
    );
    refresh();
  }
  await listing();
  return root;
}
