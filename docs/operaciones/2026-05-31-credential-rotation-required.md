# Rotación de credenciales requerida (2026-05-31)

> **Acción manual del owner**. Claude no puede ejecutar esto.

## Por qué

El code review consolidado del 2026-05-31 identificó que `.env.supabase` contiene en plaintext:

- `SUPABASE_ACCESS_TOKEN` (Supabase personal access token, prefijo de 4 chars + 32 hex) — acceso total a la Management API del proyecto.
- `SUPABASE_DB_PASSWORD` — password de Postgres del proyecto.

Aunque el archivo está en `.gitignore` y nunca se commiteó (verificado con `git log --all --diff-filter=A --name-only`), conviene tratarlos como comprometidos al haber sido expuestos a análisis externo.

## Pasos

1. **Rotar `SUPABASE_ACCESS_TOKEN`**:
   - Ir a https://supabase.com/dashboard/account/tokens
   - Revocar el token vigente
   - Generar uno nuevo, scoped solo al proyecto si es posible
   - Guardar en macOS Keychain (`security add-generic-password -a $USER -s manifiesto-supabase-access-token -w <token>`) o en 1Password CLI (`op item create`)
   - Actualizar local: borrar la línea de `.env.supabase` y leer del keychain en los scripts que lo usen
2. **Rotar `SUPABASE_DB_PASSWORD`**:
   - Dashboard → Project Settings → Database → Reset database password
   - Actualizar las connection strings en EAS Secrets y en el keychain local
   - Verificar que `npm run supabase:remote:db:push` siga funcionando
3. **Verificar que no hay otros tokens en el repo**:

Usar el scanner del pre-commit hook (`.githooks/pre-commit`) que cubre tokens Supabase, JWTs, AWS keys y OpenSSH:

```bash
bash .githooks/pre-commit
```

Expected output: vacío.

4. **Marcar este doc como cerrado** moviéndolo a `docs/operaciones/archivo/` una vez completos los pasos.

## Referencia

Code review consolidado 2026-05-31, P0 #4.
