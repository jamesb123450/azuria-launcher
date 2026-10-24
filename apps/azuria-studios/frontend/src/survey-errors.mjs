// Only locally defined messages are rendered; never echo raw service/provider errors.
export function surveyErrorMessage(code, status) {
  const messages = {
    survey_unconfigured:
      "The survey’s bot protection has not been configured yet. Please try again later.",
    bot_configuration:
      "The survey’s bot protection is misconfigured. Please let Azuria know; your answers are still here.",
    bot_expired:
      "The bot check expired. Please complete the new check below and send again. Your answers are still here.",
    bot_failed:
      "The bot check could not be verified. Please complete the new check below and try again.",
    bot_unavailable:
      "The bot-check service is temporarily unavailable. Please try again shortly.",
    survey_setup_required:
      "The survey database needs an update before it can save responses. Please let Azuria know; your answers are still here.",
    invalid_answers:
      "Your answers were not accepted. Choose at least one option for every question and keep written feedback under 2,000 characters.",
    daily_limit:
      "The survey has reached its daily response limit. Please try again tomorrow.",
    save_failed:
      "The survey could not save your feedback. Please try again later. Your answers are still here.",
  };
  if (Object.hasOwn(messages, code)) return messages[code];
  if (status === 401 || status === 403)
    return "The survey service denied access. Please let Azuria know; your answers are still here.";
  if (status === 404)
    return "The survey submission service has not been deployed yet. Please try again later.";
  if (status === 400)
    return "The survey service rejected this request. Its deployed version may need updating. Your answers are still here.";
  if (status === 429) return messages.daily_limit;
  return "We could not confirm your submission. Check your connection and try again. Your answers are still here.";
}
