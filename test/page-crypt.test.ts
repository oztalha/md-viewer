// The reader page carries its own copy of the decrypt code (embedded from
// pageCrypt.ts). Round-trip through the page as published, so the app's
// encryption and the page's decryption can't drift apart.
import { expect, test } from "bun:test";
import { encryptPage, generatePassword, MIN_PASSWORD, newPageId } from "../src/pageCrypt";

type Opened = { html: string; key: string };

async function openPage(page: string, password: string, savedKey?: string): Promise<Opened> {
  const data = /<script type="application\/json" id="d">(.*?)<\/script>/s.exec(page)![1];
  const code = /const decryptPayload = ([\s\S]*?);\nconst payload = /.exec(page)![1];
  const decrypt = new Function(`return (${code});`)();
  return decrypt(JSON.parse(data), password, savedKey);
}

test("the published page decrypts with the password, and only with it", async () => {
  const html = "<!doctype html><h1>Secret plan ünïcødé</h1>";
  const password = generatePassword();
  const { page, marker } = await encryptPage(html, password, newPageId());
  expect(page).toContain(marker);
  expect(page).not.toContain("Secret plan");
  expect((await openPage(page, password)).html).toBe(html);
  await expect(openPage(page, `${password}x`)).rejects.toThrow();
}, 30_000);

test("a remembered key survives updates, but not a new password", async () => {
  const id = newPageId();
  const password = generatePassword();
  const v1 = await encryptPage("<p>v1</p>", password, id);
  const { key } = await openPage(v1.page, password);
  // Same page and password, new content: the remembered key still opens it.
  const v2 = await encryptPage("<p>v2</p>", password, id);
  expect(v2.marker).not.toBe(v1.marker);
  expect((await openPage(v2.page, "", key)).html).toBe("<p>v2</p>");
  // A new password locks out remembered keys.
  const v3 = await encryptPage("<p>v3</p>", generatePassword(), id);
  await expect(openPage(v3.page, "", key)).rejects.toThrow();
}, 60_000);

test("generated passwords are long and readable", () => {
  const a = generatePassword();
  expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{5}(-[A-HJ-NP-Za-km-z2-9]{5}){3}$/);
  expect(a.length).toBeGreaterThanOrEqual(MIN_PASSWORD);
  expect(generatePassword()).not.toBe(a);
});
