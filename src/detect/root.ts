import { readdir } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { pathExists } from "../util/helpers.js";

export interface RootDetectionResult {
  rootDir: string;
  marker: string;
  markerPath: string;
}

export async function detectRoot(filePath: string, rootMarkers: string[]): Promise<RootDetectionResult | undefined> {
  let currentDir = dirname(resolve(filePath));
  const filesystemRoot = parse(currentDir).root;

  while (true) {
    for (const marker of rootMarkers) {
      const markerPath = await resolveMarker(currentDir, marker);
      if (markerPath) {
        return {
          rootDir: currentDir,
          marker,
          markerPath,
        };
      }
    }

    if (currentDir === filesystemRoot) {
      return undefined;
    }

    currentDir = dirname(currentDir);
  }
}

/// Resolves one marker against `baseDir`, returning the matched path. Segments
/// without `*` are literal; a segment with `*` matches directory entries
/// (e.g. `*.xcodeproj`). Matching is a literal wildcard compare — no regex.
async function resolveMarker(baseDir: string, marker: string): Promise<string | undefined> {
  const segments = marker.split(/[\\/]+/);
  if (!marker.includes("*")) {
    const markerPath = join(baseDir, ...segments);
    return (await pathExists(markerPath)) ? markerPath : undefined;
  }

  let candidates = [baseDir];
  for (const segment of segments) {
    const next: string[] = [];
    for (const dir of candidates) {
      if (!segment.includes("*")) {
        next.push(join(dir, segment));
        continue;
      }
      const entries = await readdir(dir).catch(() => [] as string[]);
      for (const entry of entries) {
        if (wildcardMatch(entry, segment)) {
          next.push(join(dir, entry));
        }
      }
    }
    candidates = next;
  }
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/// `*` matches any run of characters; everything else is literal.
function wildcardMatch(value: string, pattern: string): boolean {
  let valueIndex = 0;
  let patternIndex = 0;
  let star = -1;
  let mark = 0;
  while (valueIndex < value.length) {
    if (patternIndex < pattern.length && pattern[patternIndex] === value[valueIndex]) {
      valueIndex++;
      patternIndex++;
    } else if (patternIndex < pattern.length && pattern[patternIndex] === "*") {
      star = patternIndex++;
      mark = valueIndex;
    } else if (star >= 0) {
      patternIndex = star + 1;
      valueIndex = ++mark;
    } else {
      return false;
    }
  }
  while (patternIndex < pattern.length && pattern[patternIndex] === "*") {
    patternIndex++;
  }
  return patternIndex === pattern.length;
}
