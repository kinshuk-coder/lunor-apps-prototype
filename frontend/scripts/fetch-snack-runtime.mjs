// Self-host Expo's Snack web runtime (https://github.com/expo/snack, MIT).
//
// The hosted runtime at snack-runtime.eascdn.net only talks to an allowlist of
// parent origins (snack.expo.dev, a few partners, http://localhost:*), so the
// phone preview can't connect from our deployed domain. We download the
// runtime's index.html + main bundle into public/v2/<sdk>/ and patch the origin
// check to also accept the runtime's own host. Every other runtime file
// (images, fonts) is proxied to Expo's CDN by the /v2 rewrite in next.config.ts.
// PhonePreview points snack-sdk's `webPlayerURL` at `${origin}/v2/%%SDK_VERSION%%`.
//
// Runs before `next dev` / `next build` (see package.json). Skips work when the
// files for the current SDK are already present.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { defaultSdkVersion } = require("snack-content");

const CDN = "https://snack-runtime.eascdn.net";
const sdk = defaultSdkVersion.split(".")[0];
const outDir = path.join(process.cwd(), "public", "v2", sdk);
const marker = path.join(outDir, ".patched");

// The runtime's check is `e.startsWith('http://localhost:')`; also allow the runtime's own origin.
const ORIGIN_CHECK = /([A-Za-z_$][\w$]*)\.startsWith\('http:\/\/localhost:'\)/g;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

async function main() {
  if (existsSync(marker)) {
    console.log(`[snack-runtime] SDK ${sdk} already present`);
    return;
  }
  const html = await get(`${CDN}/v2/${sdk}/index.html`);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
  if (!scripts.length) throw new Error("no <script src> found in runtime index.html");

  let patched = 0;
  for (const src of scripts) {
    if (!src.startsWith(`/v2/${sdk}/`)) throw new Error(`unexpected script path ${src}`);
    let js = await get(`${CDN}${src}`);
    js = js.replace(ORIGIN_CHECK, (_m, v) => {
      patched += 1;
      return `(${v}.startsWith('http://localhost:')||${v}===self.location.origin)`;
    });
    const file = path.join(process.cwd(), "public", ...src.split("/").filter(Boolean));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, js);
  }
  if (patched !== 1) throw new Error(`expected 1 origin check to patch, found ${patched}; runtime changed?`);

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), html);
  await writeFile(marker, new Date().toISOString());
  console.log(`[snack-runtime] SDK ${sdk}: saved ${scripts.length} bundle(s), patched origin check`);
}

main().catch((err) => {
  console.error("[snack-runtime] failed:", err.message);
  process.exit(1);
});
