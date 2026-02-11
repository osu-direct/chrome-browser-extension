import fs from "fs-extra";
import path from "path";
import archiver from "archiver";

const DIST = "dist";
const BUILD = "build";
const RELEASE = "release";
const PUBLIC = "public";

async function zipDir(src: string, out: string): Promise<void> {
  await fs.ensureDir(path.dirname(out));

  const output = fs.createWriteStream(out);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.pipe(output);
  archive.directory(src, false);

  await archive.finalize();
  console.log("✅ Built", out);
}

async function getVersion(): Promise<string> {
  const pkg = await fs.readJson("package.json");
  return pkg.version || "0.0.0";
}

async function buildChrome(version: string): Promise<void> {
  const outDir = path.join(BUILD, "chrome");
  await fs.remove(outDir);
  await fs.mkdirp(outDir);

  await fs.copy(DIST, path.join(outDir, "dist"));

  await fs.copy(PUBLIC, outDir);

  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = await fs.readJson(manifestPath);

  manifest.version = version;

  await fs.writeJson(manifestPath, manifest, { spaces: 2 });

  await zipDir(outDir, path.join(RELEASE, `chrome-v${version}.zip`));
}

async function buildFirefox(version: string): Promise<void> {
  const outDir = path.join(BUILD, "firefox");
  await fs.remove(outDir);
  await fs.mkdirp(outDir);

  await fs.copy(DIST, path.join(outDir, "dist"));

  await fs.copy(PUBLIC, outDir);

  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = await fs.readJson(manifestPath);

  manifest.version = version;

  if (manifest.background?.service_worker) {
    manifest.background = {
      scripts: [manifest.background.service_worker]
    };
  }

  await fs.writeJson(manifestPath, manifest, { spaces: 2 });

  await zipDir(outDir, path.join(RELEASE, `firefox-v${version}.zip`));
}

async function main(): Promise<void> {
  const version = await getVersion();

  console.log("📦 Building extension version", version);

  await fs.remove(BUILD);
  await fs.remove(RELEASE);
  await fs.mkdirp(BUILD);
  await fs.mkdirp(RELEASE);

  await buildChrome(version);
  await buildFirefox(version);

  console.log("✅ Done → release/");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
