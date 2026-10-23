/**
 * Resolves local asset paths for models and WASM files across both
 * Chrome Extension runtime (chrome-extension://<id>/...) and standard Vite dev/preview server.
 */
export function getAssetUrl(relativePath: string): string {
  // Normalize leading slash
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    try {
      return chrome.runtime.getURL(cleanPath);
    } catch {
      // Fallback if chrome.runtime is partially mocked or not ready
    }
  }

  // Web server relative path
  return `/${cleanPath}`;
}
