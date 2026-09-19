// Dependency installation, demo and offline tests must never inherit build keys.
const osNames = ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'LANG', 'LC_ALL', 'HOME', 'USER', 'PLAYWRIGHT_BROWSERS_PATH'];
export function cleanEnvironment(extra = {}) {
  const env = Object.fromEntries(osNames.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
  return { ...env, NEXT_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', WATCHPACK_POLLING:'1000', NODE_OPTIONS:'--max-old-space-size=1024', TZ: 'Europe/London', ...extra };
}
export function demoEnvironment(extra = {}) {
  return cleanEnvironment({ DATA_MODE: 'demo', JEV_MODE: 'mock', ALLOW_LIVE_WRITES: 'false', ALLOW_LIVE_DATA_PROCESSING: 'false', INCLUDE_INTERNAL_NOTES_IN_MODEL: 'false', DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:55432/zenjev_demo', APP_BASE_URL: 'http://127.0.0.1:3000', ...extra });
}
