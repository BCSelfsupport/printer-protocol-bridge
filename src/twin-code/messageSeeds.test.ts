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
    // ^AB DataMatrix must be exactly 6 segments after `n` (x;y;f;t;s;data) — no `r`
    const ab = cmds[1].split("^AB1;")[1];
    expect(ab.split(";").length).toBe(6);
  });

  it("SIDE seed uses template 1 (7-dot) + font 2 (Standard 7-high), not font 7", () => {
    const cmds = buildSeedCommands(SIDE_SEED, "SIDE");
    expect(cmds[1]).toBe("^NM 1;0;0;0;SIDE^AT1;0;0;2;DRYRUN0000000");
    expect(cmds[1]).not.toMatch(/\^AT1;0;0;7;/);
  });

  it("Auto-code seed uses ^NM + named ^NF append flow (DOZEN12 pattern), font 2, ^AP type 8", () => {
    const seed = buildAutoCodeSeed({ line: "27", unit: "U", counterSlot: 1 });
    const cmds = buildSeedCommands(seed, "AUTO");
    // ^DM, ^NM (header + first field), ^NF x4, ^SV  =  7 commands
    expect(cmds.length).toBe(7);
    expect(cmds[0]).toBe("^DM AUTO");
    expect(cmds[1].startsWith("^NM 1;0;0;0;AUTO^AT1;0;0;2;27")).toBe(true);
    // No additional inline fields after the first one in ^NM
    expect(cmds[1]).not.toMatch(/\^AP/);
    expect(cmds[1]).not.toMatch(/\^AD/);
    expect(cmds[1]).not.toMatch(/\^AC/);
    // The remaining four fields each get their own ^NF line
    expect(cmds[2]).toMatch(/^\^NF AUTO;\^AP2;\d+;0;2;10$/);
    expect(cmds[3]).toMatch(/^\^NF AUTO;\^AD3;\d+;0;2;4$/);
    expect(cmds[4]).toMatch(/^\^NF AUTO;\^AC4;\d+;0;2;1;6;1$/);
    expect(cmds[5]).toMatch(/^\^NF AUTO;\^AT5;\d+;0;2;U$/);
    expect(cmds[6]).toBe("^SV");
  });

  it("buildSeedCommands passes ^AP type codes through verbatim (spec §5.33.2.7 allows any d/t)", () => {
    const seed = {
      label: "x",
      description: "x",
      commandsTemplate: ["^NM 1;0;0;0;__NAME__^AP2;13;0;2;9", "^AP3;20;0;2;10"],
    };
    const out = buildSeedCommands(seed, "AUTO");
    expect(out[0]).toBe("^NM 1;0;0;0;AUTO^AP2;13;0;2;9");
    expect(out[1]).toBe("^AP3;20;0;2;10");
  });
});
