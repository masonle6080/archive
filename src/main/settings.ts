import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { Settings, ThemeSource } from '../shared/types'

const DEFAULT_SETTINGS: Settings = {
  themeSource: 'system',
  userName: '',
  quotes: [
    'The unexamined life is not worth living. — Socrates',
    'What we plant in the soil of contemplation, we shall reap in the harvest of action. — Meister Eckhart',
    'Do the best you can until you know better. Then when you know better, do better. — Maya Angelou'
  ],
  goals: []
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function readSettings(): Settings {
  try {
    const path = settingsPath()
    if (!existsSync(path)) return DEFAULT_SETTINGS
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return {
      themeSource:
        parsed.themeSource === 'light' || parsed.themeSource === 'dark' || parsed.themeSource === 'system'
          ? parsed.themeSource
          : DEFAULT_SETTINGS.themeSource,
      userName: typeof parsed.userName === 'string' ? parsed.userName : DEFAULT_SETTINGS.userName,
      quotes:
        Array.isArray(parsed.quotes) && parsed.quotes.every((q: unknown) => typeof q === 'string')
          ? parsed.quotes
          : DEFAULT_SETTINGS.quotes,
      goals: Array.isArray(parsed.goals) && parsed.goals.every((g: unknown) => typeof g === 'string')
        ? parsed.goals
        : typeof parsed.goals === 'string' && parsed.goals
          ? [parsed.goals]
          : DEFAULT_SETTINGS.goals
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeSettings(settings: Settings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings))
}

export function getSettings(): Settings {
  return readSettings()
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch }
  writeSettings(next)
  return next
}

export function getThemeSource(): ThemeSource {
  return readSettings().themeSource
}

export function setThemeSource(themeSource: ThemeSource): void {
  updateSettings({ themeSource })
}
