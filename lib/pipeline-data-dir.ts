import path from "path";

export function getPipelineDataDir() {
  return process.env.LEADGRID_DATA_DIR || path.join(process.cwd(), "data");
}

export function getPipelineDataPath(fileName: string) {
  return path.join(getPipelineDataDir(), fileName);
}
