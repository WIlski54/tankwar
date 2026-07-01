const config = globalThis.window?.__PANZER_CONFIG__ ?? {};
const assetBaseUrl = String(config.assetBaseUrl ?? "").replace(/\/+$/, "");
const assetVersion = String(config.assetVersion ?? "").trim();

export function assetUrl(path) {
  if (!assetBaseUrl) return path;
  const cleanPath = String(path).replace(/^\.\//, "").replace(/^\/+/, "");
  const url = new URL(cleanPath, `${assetBaseUrl}/`);
  if (assetVersion) url.searchParams.set("v", assetVersion);
  return url.href;
}
