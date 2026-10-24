import test from "node:test";
import assert from "node:assert/strict";
import { surveyErrorMessage } from "../src/survey-errors.mjs";
test("survey errors distinguish database setup from bot expiry without displaying server text", () => {
  assert.match(
    surveyErrorMessage("survey_setup_required", 503),
    /database needs an update/,
  );
  assert.doesNotMatch(surveyErrorMessage("save_failed", 503), /bot check/i);
  assert.match(surveyErrorMessage("bot_expired", 400), /expired/);
  assert.match(surveyErrorMessage("bot_configuration", 503), /misconfigured/);
  assert.match(surveyErrorMessage(undefined, 401), /denied access/);
  assert.match(surveyErrorMessage(undefined, 404), /not been deployed/);
  assert.doesNotMatch(
    surveyErrorMessage("<script>unsafe</script>", 500),
    /unsafe/,
  );
  assert.match(surveyErrorMessage(), /connection/);
});
