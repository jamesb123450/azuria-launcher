import test from "node:test";
import assert from "node:assert/strict";
import { advertisingMarkup } from "../src/advertising.mjs";
const snippet =
  '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456"></script><ins class="adsbygoogle" data-ad-client="ca-pub-1234567890123456" data-ad-slot="1234567890"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>';
test("advertising stays absent by default and requires explicit consent setup", () => {
  assert.equal(advertisingMarkup(snippet), "");
  assert.throws(() => advertisingMarkup(snippet, { enabled: true }), /consent/);
  assert.throws(
    () =>
      advertisingMarkup("<!-- empty -->", {
        enabled: true,
        consentReady: true,
      }),
    /complete/,
  );
  assert.match(
    advertisingMarkup(snippet, { enabled: true, consentReady: true }),
    /aria-label="Advertisement"/,
  );
});
