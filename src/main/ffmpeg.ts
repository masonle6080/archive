import { execFileSync } from 'child_process'
import { existsSync } from 'fs'

// GUI-launched apps on macOS don't inherit the shell's PATH, so a plain
// `ffmpeg` lookup misses Homebrew installs. Check common install locations
// before falling back to PATH resolution.
const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']

export function findFfmpeg(): string | null {
  for (const candidate of FFMPEG_CANDIDATES) {
    try {
      if (candidate.startsWith('/') && !existsSync(candidate)) continue
      execFileSync(candidate, ['-version'], { stdio: 'ignore' })
      return candidate
    } catch {
      continue
    }
  }
  return null
}
