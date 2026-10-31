export type OmittedFile = { file: string; reason: string };
export type PreparedDiff = { text: string; totalFiles: number; omitted: OmittedFile[] };

// Files that burn tokens without telling a reviewer anything.
const LOW_VALUE = [
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Gemfile\.lock|go\.sum|composer\.lock|bun\.lockb?)$/,
  /\.min\.(js|css)$/,
  /(^|\/)(dist|build|\.next|vendor|node_modules)\//,
  /\.snap$/,
  /\.(png|jpe?g|gif|ico|webp|woff2?|pdf|zip)$/i,
];

// Splits a unified diff by file, drops lockfiles and generated files, and stops at `limit` characters.
export function prepareDiff(diff: string, limit = 300_000): PreparedDiff {
  const chunks = diff.split(/^(?=diff --git )/m).filter((c) => c.startsWith("diff --git "));
  const kept: string[] = [];
  const omitted: OmittedFile[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const file = chunk.match(/^diff --git a\/.+? b\/(.+)$/m)?.[1] ?? "(unknown file)";
    if (LOW_VALUE.some((re) => re.test(file))) {
      omitted.push({ file, reason: "lockfile, generated or binary" });
    } else if (used + chunk.length > limit) {
      omitted.push({ file, reason: "diff size limit" });
    } else {
      kept.push(chunk);
      used += chunk.length;
    }
  }
  return { text: kept.join(""), totalFiles: chunks.length, omitted };
}
