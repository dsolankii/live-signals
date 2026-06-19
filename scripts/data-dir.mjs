import path from "path";

const ROOT = process.cwd();

export const DATA_DIR =
  process.env.LEADGRID_DATA_DIR || path.join(ROOT, "data");

export function dataPath(...parts) {
  return path.join(DATA_DIR, ...parts);
}
