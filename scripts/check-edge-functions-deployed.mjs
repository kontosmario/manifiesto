#!/usr/bin/env node
// check-edge-functions-deployed.mjs
// ----------------------------------------------------------------------
// Guard contra el gap que dejó `register-push-subscription` SIN deployar
// durante ~7-10 semanas (auditoría push 2026-06-15): existía en
// supabase/functions/ pero nunca se agregó ni a config.toml ni a los
// scripts de deploy, así que el pipeline normal nunca la subía y el push
// estuvo roto en silencio.
//
// Este check exige que CADA función en supabase/functions/ (salvo los
// helpers `_*`) tenga una sección [functions.<name>] explícita en
// supabase/config.toml. Eso fuerza una decisión consciente de verify_jwt
// por función (un redeploy sin entry vuelve al default true del gateway,
// que es justo lo que rompió el cron del orchestrator) y deja un único
// lugar canónico que enumera todo lo deployable.
//
// Uso: node scripts/check-edge-functions-deployed.mjs
// Exit 0 si todas están cubiertas; 1 + reporte si falta alguna.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const functionsDir = path.join(projectRoot, 'supabase', 'functions')
const configPath = path.join(projectRoot, 'supabase', 'config.toml')

function listFunctionDirs() {
  return readdirSync(functionsDir)
    .filter((name) => !name.startsWith('_') && name !== 'node_modules')
    .filter((name) => {
      try {
        return statSync(path.join(functionsDir, name)).isDirectory()
      } catch {
        return false
      }
    })
    .sort()
}

function configuredFunctions() {
  const toml = readFileSync(configPath, 'utf8')
  const re = /^\s*\[functions\.([A-Za-z0-9_-]+)\]/gm
  const out = new Set()
  let m
  while ((m = re.exec(toml)) !== null) out.add(m[1])
  return out
}

const dirs = listFunctionDirs()
const configured = configuredFunctions()
const missing = dirs.filter((name) => !configured.has(name))

if (missing.length > 0) {
  process.stderr.write(
    `\n✗ Edge functions sin sección [functions.<name>] en supabase/config.toml:\n` +
      missing.map((n) => `    • ${n}`).join('\n') +
      `\n\n  Agregá [functions.${missing[0]}] con verify_jwt explícito.\n` +
      `  (Sin entry, un redeploy aplica el default verify_jwt=true del\n` +
      `   gateway — eso rompió el cron del orchestrator el 2026-06-15.)\n\n`,
  )
  process.exit(1)
}

process.stdout.write(
  `✓ ${dirs.length} edge functions cubiertas en config.toml: ${dirs.join(', ')}\n`,
)
