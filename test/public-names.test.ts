// This repo is public. Service-specific publish setups (internal tools, hosts,
// URLs) belong in the user's ~/.config/md-viewer/publish.json, never here.
import { expect, test } from "bun:test";
import { execSync } from "node:child_process";

const FORBIDDEN = /chorus|artifactory|amazon|aws\.dev|midway|toolbox|a2z\.com/i;

test("no internal service names in tracked files", () => {
  const files = execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !/(\.lock|lockb|\.png|\.icns|\.ico|test\/public-names\.test\.ts)$/.test(f));
  const hits = files.filter((f) => {
    try {
      return FORBIDDEN.test(execSync(`cat ${JSON.stringify(f)}`, { encoding: "utf8" }));
    } catch {
      return false;
    }
  });
  expect(hits).toEqual([]);
});
