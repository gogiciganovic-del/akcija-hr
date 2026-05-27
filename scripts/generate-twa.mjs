import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { TwaManifest, TwaGenerator, ConsoleLog } from "@bubblewrap/core";

const targetDirectory = path.resolve("android-twa");
const manifestPath = path.join(targetDirectory, "twa-manifest.json");

const twaManifest = await TwaManifest.fromWebManifest("https://cjenko.app/manifest.json");
twaManifest.host = "cjenko.app";
twaManifest.startUrl = "/";
twaManifest.name = "Cjenko";
twaManifest.launcherName = "Cjenko";
twaManifest.packageId = "app.cjenko.app";
twaManifest.appVersionCode = 1;
twaManifest.appVersionName = "1";
twaManifest.display = "standalone";
twaManifest.orientation = "portrait";
twaManifest.themeColor = twaManifest.themeColor;
twaManifest.backgroundColor = twaManifest.backgroundColor;
twaManifest.signingKey.path = path.join(targetDirectory, "android.keystore");
twaManifest.signingKey.alias = "upload";

await fs.mkdir(targetDirectory, { recursive: true });
await twaManifest.saveToFile(manifestPath);

const generator = new TwaGenerator();
const log = new ConsoleLog("twa-generate");
await generator.createTwaProject(targetDirectory, twaManifest, log);

const checksum = crypto
  .createHash("sha1")
  .update(await fs.readFile(manifestPath))
  .digest("hex");
await fs.writeFile(path.join(targetDirectory, "manifest-checksum.txt"), checksum);

console.log(`Generated TWA project in ${targetDirectory}`);
