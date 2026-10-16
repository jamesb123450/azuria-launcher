import { describe, it, expect } from "vitest";
import { reactive } from "vue";
import {
  defaultLaunchOptions,
  effectiveOptions,
  overrideFlags,
  selectedOverrides,
  validateOptions,
} from "../../src/lib/launch-options";
describe("game preference inheritance", () => {
  it("copies reactive defaults and preserves explicit false and empty overrides", () => {
    const defaults = reactive(defaultLaunchOptions());
    defaults.window.fullscreen = true;
    defaults.environment = { TEST: "inherited" };
    const effective = effectiveOptions(defaults, {
      memoryMb: 8192,
      environment: {},
      window: { fullscreen: false, width: 900, height: 600 },
    });
    expect(effective.memoryMb).toBe(8192);
    expect(effective.environment).toEqual({});
    expect(effective.window.fullscreen).toBe(false);
    effective.javaArguments.push("test");
    expect(defaults.javaArguments).toEqual([]);
  });
  it("persists only enabled overrides so defaults can change later", () => {
    const defaults = defaultLaunchOptions();
    const flags = overrideFlags({ memoryMb: 8192 });
    const selected = selectedOverrides({ ...defaults, memoryMb: 8192 }, flags);
    expect(selected).toEqual({ memoryMb: 8192 });
    expect(
      effectiveOptions({ ...defaults, javaPath: "custom.exe" }, selected)
        .javaPath,
    ).toBe("custom.exe");
    flags.memoryMb = false;
    expect(selectedOverrides(defaults, flags)).toEqual({});
  });
  it("rejects invalid options and accepts defaults", () => {
    expect(validateOptions(defaultLaunchOptions())).toBe("");
    expect(
      validateOptions({ ...defaultLaunchOptions(), memoryMb: 513 }),
    ).toContain("Memory");
    expect(
      validateOptions({ ...defaultLaunchOptions(), javaPath: "" }),
    ).toContain("Java");
    expect(
      validateOptions({
        ...defaultLaunchOptions(),
        environment: { "BAD=NAME": "x" },
      }),
    ).toContain("environment");
    expect(
      validateOptions({
        ...defaultLaunchOptions(),
        window: { fullscreen: false, width: 0, height: 720 },
      }),
    ).toContain("resolution");
  });
});
