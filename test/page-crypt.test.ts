// The reader page carries its own copy of the decrypt code (embedded from
// pageCrypt.ts). Round-trip through the page as published, so the app's
// encryption and the page's decryption can't drift apart.
import { expect, test } from "bun:test";
import { encryptPage, generatePassword, MIN_PASSWORD } from "../src/pageCrypt";

async function openPage(page: string, password: string): Promise<string> {
  const data = /<script type="application\/json" id="d">(.*?)<\/script>/s.exec(page)![1];
  const code = /const decryptPayload = ([\s\S]*?);\ndocument\.getElementById/.exec(page)![1];
  const decrypt = new Function(`return (${code});`)();
  return decrypt(JSON.parse(data), password);
}

test("the published page decrypts with the password, and only with it", async () => {
  const html = "<!doctype html><h1>Secret plan ünïcødé</h1>";
  const password = generatePassword();
  const { page, marker } = await encryptPage(html, password);
  expect(page).toContain(marker);
  expect(page).not.toContain("Secret plan");
  expect(await openPage(page, password)).toBe(html);
  await expect(openPage(page, `${password}x`)).rejects.toThrow();
}, 30_000);

test("generated passwords are long and readable", () => {
  const a = generatePassword();
  expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{5}(-[A-HJ-NP-Za-km-z2-9]{5}){3}$/);
  expect(a.length).toBeGreaterThanOrEqual(MIN_PASSWORD);
  expect(generatePassword()).not.toBe(a);
});
