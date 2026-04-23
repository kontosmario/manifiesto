import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const localEnvPath = path.join(projectRoot, '.env.supabase')
const fallbackProjectRefPath = path.join(projectRoot, 'supabase', '.temp', 'project-ref')

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return {}
  }

  const content = readFileSync(filePath, 'utf8')
  const env = {}

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

function readFallbackProjectRef() {
  if (!existsSync(fallbackProjectRefPath)) {
    return ''
  }

  return readFileSync(fallbackProjectRefPath, 'utf8').trim()
}

function hasFlag(args, ...flags) {
  return args.some((arg) => flags.includes(arg))
}

function appendFlag(args, flag, value) {
  if (!value || hasFlag(args, flag)) {
    return args
  }

  return [...args, flag, value]
}

function exitWithMessage(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const fileEnv = loadDotEnv(localEnvPath)
const runtimeEnv = { ...fileEnv, ...process.env }
const projectRef = runtimeEnv.SUPABASE_PROJECT_REF?.trim() || readFallbackProjectRef()
const accessToken = runtimeEnv.SUPABASE_ACCESS_TOKEN?.trim() || ''
const dbPassword = runtimeEnv.SUPABASE_DB_PASSWORD?.trim() || ''
const args = process.argv.slice(2)

if (args.length === 0) {
  exitWithMessage(
    [
      'Uso: npm run supabase:remote -- <comando>',
      'Ejemplos:',
      '  npm run supabase:remote:login',
      '  npm run supabase:remote:link',
      '  npm run supabase:remote:db:push',
      '  npm run supabase:remote:functions:deploy',
      '  npm run supabase:remote -- secrets set NOMBRE=valor',
    ].join('\n'),
  )
}

let cliArgs = [...args]
const [group, subcommand] = args

if (group === 'login') {
  if (!accessToken) {
    exitWithMessage(
      'Falta SUPABASE_ACCESS_TOKEN. Creá .env.supabase a partir de .env.supabase.example.',
    )
  }

  cliArgs = appendFlag(cliArgs, '--token', accessToken)
}

if (group === 'link') {
  if (!projectRef) {
    exitWithMessage('Falta SUPABASE_PROJECT_REF para vincular el proyecto remoto.')
  }

  cliArgs = appendFlag(cliArgs, '--project-ref', projectRef)

  if (dbPassword) {
    cliArgs = appendFlag(cliArgs, '--password', dbPassword)
  }
}

if (group === 'db' && (subcommand === 'push' || subcommand === 'pull')) {
  if (!dbPassword) {
    process.stderr.write(
      'Aviso: falta SUPABASE_DB_PASSWORD; la CLI puede pedirla al ejecutar la operación.\n',
    )
  } else {
    cliArgs = appendFlag(cliArgs, '--password', dbPassword)
  }
}

if (group === 'functions' && subcommand === 'deploy') {
  if (!projectRef) {
    exitWithMessage('Falta SUPABASE_PROJECT_REF para deployar funciones al proyecto remoto.')
  }

  cliArgs = appendFlag(cliArgs, '--project-ref', projectRef)
}

const child = spawn(
  path.join(projectRoot, 'node_modules', '.bin', 'supabase'),
  cliArgs,
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
