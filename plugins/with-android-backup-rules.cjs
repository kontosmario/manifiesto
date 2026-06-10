// @ts-check
/**
 * Expo config plugin: ships backup/data-extraction rule XMLs into the
 * Android prebuild output.
 *
 * Red team finding (2026-06-10, Sprint E · C3) — Critical
 * ------------------------------------------------------
 * Expo's default AndroidManifest template (since SDK 50+) sets
 *   android:allowBackup="true"
 *   android:fullBackupContent="@xml/secure_store_backup_rules"
 *   android:dataExtractionRules="@xml/secure_store_data_extraction_rules"
 * on the <application> tag, but Expo never writes the referenced XMLs.
 * On release builds the rules silently fall back to "back up everything",
 * which means `adb backup -f out.ab` could extract:
 *   - AsyncStorage (TanStack Query cache, pin-enabled-flag,
 *     biometric-enabled-flag, etc.)
 *   - SecureStore SharedPreferences (encrypted blobs — keys stay in
 *     Android Keystore, but metadata still leaks)
 * to a workstation, and Google's auto-backup / device-transfer flow would
 * ship that same data across devices without re-auth.
 *
 * What this plugin does
 * ---------------------
 * On every `expo prebuild`, copies the two XMLs from
 * `plugins/android-backup-rules/` into
 * `android/app/src/main/res/xml/`, creating the directory if missing.
 * The android/ directory is gitignored (continuous prebuild), so without
 * this plugin the XMLs would be wiped on every regeneration.
 *
 * Both XMLs exclude SecureStore + AsyncStorage from cloud-backup AND
 * device-transfer. The security boundary is Supabase — on a new device
 * the user re-auths and re-syncs from there.
 *
 * Written as CommonJS .cjs (not .ts) because Expo's plugin resolver
 * loads plugin entries via plain `require`, which does not understand
 * TypeScript. The .cjs extension is required because this project's
 * package.json sets "type": "module", making .js files ESM by default.
 * The wrapper itself is trivial enough that we don't need TS, and
 * types come from JSDoc + the @ts-check pragma above.
 */

const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('node:fs/promises')
const path = require('node:path')

const SOURCE_DIR_REL = path.join('plugins', 'android-backup-rules')
const FILES = [
  'secure_store_backup_rules.xml',
  'secure_store_data_extraction_rules.xml',
]

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withAndroidBackupRules = (config) => {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot
      const sourceDir = path.join(projectRoot, SOURCE_DIR_REL)
      const targetDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      )

      await fs.mkdir(targetDir, { recursive: true })

      for (const name of FILES) {
        const src = path.join(sourceDir, name)
        const dst = path.join(targetDir, name)
        await fs.copyFile(src, dst)
      }

      return cfg
    },
  ])
}

module.exports = withAndroidBackupRules
module.exports.default = withAndroidBackupRules
