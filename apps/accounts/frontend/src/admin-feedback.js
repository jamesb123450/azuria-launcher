// Results are only returned by RPCs that enforce a live admin role and MFA.
export async function feedbackWorkspace({ client, ui }) {
  const { paragraph, button } = ui;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const root = node("div", undefined, "admin-feedback");
  root.append(
    paragraph(
      "Anonymous feedback about Minecraft launchers. Each question allows more than one answer, so percentages can add up to more than 100%.",
    ),
  );
  const message = paragraph("", "fine");
  message.setAttribute("role", "status");
  root.append(message);
  const results = node("div");
  root.append(results);
  let offset = 0;
  async function load() {
    message.textContent = "Loading feedback…";
    const [summary, responses] = await Promise.all([
      client.rpc("feedback_admin_summary"),
      client.rpc("feedback_admin_responses", { p_offset: offset }),
    ]);
    if (summary.error || responses.error) {
      message.textContent =
        "Could not load feedback. Check that the survey migration has been applied and verify your admin access.";
      const retry = button("Try again", () => {
        retry.disabled = true;
        load().finally(() => {
          retry.disabled = false;
        });
      });
      results.replaceChildren(retry);
      return;
    }
    const data = summary.data;
    message.textContent = `${data.total} anonymous ${data.total === 1 ? "response" : "responses"}`;
    results.replaceChildren();
    if (!data.total) {
      results.append(
        paragraph(
          "No responses yet. Share the survey link to start collecting feedback.",
        ),
      );
      return;
    }
    const grid = node("div", undefined, "feedback-summary-grid");
    for (const question of data.schema.questions) {
      const card = node("section", undefined, "admin-panel");
      card.append(node("h3", question.title));
      for (const [id, label] of question.options) {
        const votes = Number(data.counts[question.id]?.[id] || 0),
          percent = Math.round((votes / data.total) * 100);
        const row = node("div", undefined, "feedback-result");
        const labels = node("div", undefined, "feedback-result-label");
        labels.append(
          node("span", label),
          node("span", `${votes} · ${percent}%`),
        );
        const meter = node("meter");
        meter.min = 0;
        meter.max = data.total;
        meter.value = votes;
        meter.setAttribute(
          "aria-label",
          `${label}: ${votes} of ${data.total} responses`,
        );
        row.append(labels, meter);
        card.append(row);
      }
      grid.append(card);
    }
    results.append(
      grid,
      node("h3", "Individual responses"),
      paragraph(
        "No account details are attached. Written feedback may contain information volunteered by respondents. Dates are stored without a time.",
        "fine",
      ),
    );
    for (const response of responses.data) {
      const item = node("details", undefined, "admin-panel feedback-response");
      item.append(
        node(
          "summary",
          `Anonymous response · ${new Date(`${response.submitted_on}T12:00:00Z`).toLocaleDateString()} · ${response.id.slice(0, 8)}`,
        ),
      );
      for (const question of data.schema.questions) {
        const selected = new Set(response.answers[question.id] || []);
        item.append(
          node("h4", question.title),
          paragraph(
            question.options
              .filter(([id]) => selected.has(id))
              .map(([, label]) => label)
              .join(" · "),
          ),
        );
      }
      if (response.extra_feedback) {
        const written = paragraph(response.extra_feedback);
        written.style.whiteSpace = "pre-wrap";
        item.append(node("h4", "Extra feedback"), written);
      }
      results.append(item);
    }
    const pages = node("div", undefined, "row");
    if (offset > 0)
      pages.append(
        button("Previous responses", async () => {
          offset = Math.max(0, offset - 25);
          await load();
        }),
      );
    if (responses.data.length === 25 && offset < 100000)
      pages.append(
        button("Next responses", async () => {
          offset += 25;
          await load();
        }),
      );
    results.append(pages);
  }
  try {
    await load();
  } catch {
    message.textContent = "Could not load feedback. Use Refresh to try again.";
  }
  return root;
}
