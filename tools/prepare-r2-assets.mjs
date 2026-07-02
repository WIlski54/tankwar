import {
  copyFile,
  mkdir,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outputRoot = join(root, "deploy", "r2");
const files = [
  "assets/tank_runtime.glb",
  "assets/powerups/health.glb",
  "assets/powerups/life.glb",
  "assets/powerups/ammo.glb",
  "assets/powerups/shield.glb",
  "assets/powerups/reflect.glb",
  "assets/powerups/lethal.glb",
  "assets/powerups/hammer.glb",
  "assets/powerups/mine.glb",
  "assets/powerups/satellite.glb",
  "assets/audio/tank-drive.mp3",
  "assets/audio/explosion.mp3",
  "assets/audio/tank-shot.mp3",
  "assets/audio/eclipse-within.mp3",
  "assets/ui/panzer-duell-title.png",
  "assets/ui/menu-button-red.png",
  "assets/ui/menu-button-blue.png",
  "assets/ui/wk-logo.glb",
];

await rm(outputRoot, { recursive: true, force: true });
let bytes = 0;
for (const relativePath of files) {
  const source = join(root, relativePath);
  const destination = join(outputRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  bytes += (await stat(source)).size;
}

console.log(`R2-Paket erstellt: ${outputRoot}`);
console.log(`${files.length} Dateien, ${(bytes / 1048576).toFixed(1)} MB`);
console.log("Lade den Ordner 'assets' in das Stammverzeichnis des R2-Buckets hoch.");
