import { copyFile, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const pagesAssets = path.join(projectRoot, "assets");

await copyFile(path.join(distRoot, "index.html"), path.join(projectRoot, "index.html"));
await rm(pagesAssets, { recursive: true, force: true });
await cp(path.join(distRoot, "assets"), pagesAssets, { recursive: true });

console.log("Synchronized the production bundle to the repository root for branch-based Pages.");
