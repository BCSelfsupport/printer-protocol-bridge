import { describe, it, expect } from "vitest";
import {
  LID_SEED,
  SIDE_SEED,
  buildSeedCommands,
  buildAutoCodeSeed,
} from "./messageSeeds";

describe("messageSeeds — protocol v2.6 conformance", () => {
  it("LID seed uses template 4 (16-dot) + DataMatrix size 5 (16x16), no spurious r segment", () => {
    const cmds = buildSeedCommands(LID_SEED, "LID");
    expect(cmds[0]).toBe("^DM LID");
    expect(cmds[1]).toBe("^NM 4;0;0;0;LID^AB1;0;0;0;7;5;DRYRUN0000000");
    expect(cmds[2]).toBe("^SV");
    // ^AB DataMatrix must be exactly 7 segments (no `r`)
    const ab = cmds[1].split("^AB1;")[1];
    expect(ab.split(";").length).toBe(7);
  });

  it("SIDE seed uses template 1 (7-dot) + font 2 (Standard 7-high), not font 7", () => {
    const cmds = buildSeedCommands(SIDE_SEED, "SIDE");
    expect(cmds[1]).toBe("^NM 1;0;0;0;SIDE^AT1;0;0;2;DRYRUN0000000");
    expect(cmds[1]).not.toMatch(/\^AT1;0;0;7;/);
  });

  it("Auto-code seed uses ^AP type 8 (program year) and font 2 on template 1", () => {
    const seed = buildAutoCodeSeed({ line: "27", unit: "U", counterSlot: 1 });
    const cmds = buildSeedCommands(seed, "AUTO");
    const nm = cmds[1];
    // template + name
    expect(nm.startsWith("^NM 1;0;0;0;AUTO")).toBe(true);
    // last segment of ^AP must be 8, never 9
    expect(nm).toMatch(/\^AP2;\d+;0;2;8(?=\^|$)/);
    expect(nm).not.toMatch(/\^AP\d+;\d+;\d+;\d+;9(?=\^|$)/);
    // font 2 used in every field
    expect(nm).toMatch(/\^AT1;0;0;2;27/);
    expect(nm).toMatch(/\^AD3;\d+;0;2;4/);
    expect(nm).toMatch(/\^AC4;\d+;0;2;1/);
    expect(cmds[2]).toBe("^SV");
  });

  it("buildSeedCommands rewrites stale ^AP …;9 → ;8 safety net", () => {
    const stale = {
      label: "x",
      description: "x",
      commandsTemplate: ["^NM 1;0;0;0;__NAME__^AP2;13;0;2;9"],
    };
    const out = buildSeedCommands(stale, "AUTO");
    expect(out[0]).toBe("^NM 1;0;0;0;AUTO^AP2;13;0;2;8");
  });
});
