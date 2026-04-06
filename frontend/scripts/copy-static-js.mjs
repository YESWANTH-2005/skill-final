import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const sourceDir = resolve(projectRoot, "js");
const distDir = resolve(projectRoot, "dist");
const targetDir = resolve(distDir, "js");

if (!existsSync(distDir)) {
  throw new Error("dist directory not found. Run the Vite build before copying static JS.");
}

if (!existsSync(sourceDir)) {
  throw new Error("Source JS directory not found: frontend/js");
}

mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true, force: true });

console.log("Copied frontend/js to dist/js");
