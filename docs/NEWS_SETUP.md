# News publishing

News is managed at **https://accounts.azuriasmp.org/admin#news**. The launcher
homepage and **https://launcher.azuriasmp.org/news/** read the same published
stories. No redeployment is needed when a story is published or edited; readers
see changes when they refresh the website or return to the launcher home page.
There is no background polling.

## One-time database setup

1. Use the existing Azuria Supabase project. Apply the accounts, friends and admin
   migrations first if they are not already installed. Your admin role and
   authenticator must already be configured; see [ADMIN_SETUP.md](ADMIN_SETUP.md).
2. Open **SQL Editor → New query**. Paste the contents of
   `services/accounts/supabase/migrations/202610210001_news.sql` and run it **once**.
   This creates the news tables, publishing functions and `news-images` storage
   bucket together. It does not change existing accounts or friends.
3. In **Storage**, confirm `news-images` exists. It accepts JPG, PNG and WebP files
   up to 5 MB. Upload through the dashboard after signing in as an admin.

This feature needs no additional Edge Function, SMTP setting or service-role key.
Never place a database password, Resend key or service-role key in a website
variable, GitHub variable, news article or image.

## Connect the launcher website on Vercel

In the **launcher website's Vercel project → Settings → Environment Variables**,
add the same two public values already used for launcher builds:

| Variable                          | Value                                                                 |
| --------------------------------- | --------------------------------------------------------------------- |
| `AZURIA_SUPABASE_URL`             | Your Supabase project URL, such as `https://your-project.supabase.co` |
| `AZURIA_SUPABASE_PUBLISHABLE_KEY` | The publishable key beginning `sb_publishable_`                       |
| `AZURIA_SITE_URL`                 | `https://launcher.azuriasmp.org/`                                     |

Redeploy once after merging. These are **public** configuration values: the built
site includes them so it can request published news. Database permissions protect
drafts and admin operations. The service-role key must never be used here.

The accounts website continues using `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`; no new keys are needed there. Redeploy it after
merging to load the editor and updated image policy.

Launcher releases already receive `AZURIA_SUPABASE_URL` and
`AZURIA_SUPABASE_PUBLISHABLE_KEY` from GitHub Actions **Variables**. Keep these
configured and build a new release to enable the news cards. Older launcher builds
keep their existing homepage. The GitHub Pages website build also uses those two
repository variables.

For local static-site builds, export the variables into the shell before running
`npm run website:build`; that build does not automatically load `.env` files.
Leaving both unset shows an honest news placeholder. Setting only one, an invalid
project URL or a non-publishable key makes the build fail.

## Publish and edit

1. Open **Admin → News → Create story** after password/authenticator verification.
2. Enter a title, URL slug and short card summary. Upload a cover, describe it for
   screen readers and choose its framing. The same cover is used on the launcher,
   website cards and the top of the article.
3. Write the article. Separate paragraphs with a blank line, use `#`, `##` or `###`
   for headings and `-` for lists. This is a simple text editor, not an HTML editor;
   HTML is displayed literally. Choose an accent colour and reading width, then
   review the page preview.
4. **Save draft** keeps the article hidden. **Publish** makes it public. A cover,
   image description and non-empty article are required to publish.
5. Reopen any story to edit its title, summary, text, cover or presentation.
   **Save changes** updates the published page. To hide it, choose **Unpublish**;
   it remains editable as a draft. Unpublish before changing its URL slug.

The image appears first, then the title, then the first publication date in UTC
and original creator's username with a faded `(admin)`, followed by the text.
Editing or republishing preserves this date and authorship, including when another
admin makes the edit. Changes are recorded with the acting admin and revision in
`news_history`, accessible through trusted database administration.

Unsaved text stays in the current tab's memory while re-verifying admin access or
switching dashboard sections. **Continue unsaved draft** restores it. Closing or
reloading the tab loses unsaved changes; save a draft first. Concurrent edits are
rejected rather than silently overwriting another admin's changes. Copy your text
and reopen the latest story if that happens.

Uploaded image URLs are public immediately, including for drafts. Use only images
that can be public and that you have permission to use. Uploading a replacement
creates a new immutable URL; old images remain in storage to avoid breaking cached
pages. Unpublishing hides the article, not an already-public image. Orphaned images
can be removed later through trusted Storage administration after checking their
references in `news_posts.cover_path`.

## Check after deployment

Create and save a draft: it must not appear in `/news/` or the launcher. Publish it,
refresh both surfaces, and open its card. Check the cover/title/date/username/body
order. Edit the title and cover, save, and refresh the same URL. Unpublish it and
check it disappears from the feed and is no longer readable publicly. Test using a
signed-out browser as well as your admin account.

Article URLs use `/news/?story=your-slug` so they work with both Vercel and the
existing static GitHub Pages output. Article content is loaded at runtime;
article-specific social preview images and server-rendered search metadata are
not generated by this static build. The cover is visible at the top of the page.
