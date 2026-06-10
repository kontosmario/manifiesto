# Dominio + sitio legal LIVE · COMPLETED

> **Fecha**: 2026-06-10
> **Tipo**: milestone — items H1 + H2 del ready-pendientes cerrados end-to-end.
> **Resultado**: la app en TestFlight ya linkea a Privacy + Terms reales en producción.

## TL;DR

| Componente | Estado |
|---|---|
| Dominio `manifiestoapp.com` | ✅ Comprado vía Cloudflare Registrar (~USD 10/año) |
| DNS | ✅ Cloudflare nameservers |
| Email forwarding | ✅ `soporte@` + `support@` → `kontosmario@gmail.com` |
| Hosting sitio público | ✅ Cloudflare Pages (`manifiestoapp-site.pages.dev`) |
| Custom domain + SSL | ✅ apex (`manifiestoapp.com`) + www |
| Privacy Policy LIVE | ✅ `https://manifiestoapp.com/privacy/` |
| Terms of Service LIVE | ✅ `https://manifiestoapp.com/terms/` |
| Mobile OTA aplicado | ✅ rows visibles en About + Soporte mailto funciona |

## Decisiones técnicas tomadas

### Dominio: `manifiestoapp.com` en vez de `manifiesto.app`

`manifiesto.app` (el placeholder histórico en docs) no estaba disponible al momento de compra. Owner registró `manifiestoapp.com` vía Cloudflare Registrar. Ventajas:
- Sin markup sobre wholesale.
- Privacy WHOIS protection incluida.
- DNS, email routing, Pages hosting todo en el mismo dashboard.

### Email: forwarding gratis (no mailbox real)

Cloudflare Email Routing forwardea ambos aliases (`soporte@` español + `support@` inglés) a `kontosmario@gmail.com`. Para responder con identidad del dominio, se puede configurar "Send As" en Gmail con SMTP de Cloudflare más adelante. Por ahora alcanza el forwarding.

### Hosting: Cloudflare Pages en repo dedicado

Repo nuevo: [`kontosmario/manifiestoapp-site`](https://github.com/kontosmario/manifiestoapp-site).

Por qué separamos del repo `manifiesto`:
- Concerns distintos: app móvil privada vs sitio público estático.
- Deploys distintos: Cloudflare Pages auto-deploya en push (~30s), no necesita workflow propio.
- Cloudflare Pages necesita acceso al repo — más limpio darle acceso a un repo público dedicado que al repo de la app entero.

Origin del contenido del sitio: el `site/` que ya existía en el repo principal (642 LOC index + 2029 LOC CSS + 238 LOC JS + assets SVG custom) se importó y adaptó al dominio nuevo. Cero re-design — el sitio del 2026-05-11 ya era polido y representativo del producto.

### Flow Cloudflare Pages (gotcha)

Cloudflare unificó Workers + Pages en una sola UI en 2024. El default es Workers (`npx wrangler deploy`), que NO funciona para sitios estáticos sin `wrangler.toml`. El flow correcto está escondido:

```
Workers & Pages → Create application → al final del wizard hay un link
"Looking to deploy Pages? Get started" → click → flow Pages tradicional
```

Documentado para futuros developers en este proyecto u otros.

### Mobile: OTA en vez de re-build

El cambio del dominio en `mobile/lib/legal-urls.ts` es JS-only → no requiere rebuild + re-submit. `eas update --branch production` propagó el bundle nuevo al build TestFlight 1.0.0 (1) en ~30 segundos.

Update Group ID: `64b2bb9a-884e-4920-b736-a2de70324766`
iOS update ID: `019eaf1b-39df-75df-aba9-47659a50a299`

## Commits relevantes

| SHA | Repo | Descripción |
|---|---|---|
| `7fe647a` | manifiesto | fix(domain): manifiesto.app → manifiestoapp.com |
| `f25abc7` | manifiesto | chore(repo): remover site/ y deploy-pages.yml |
| `b6c0abe` | manifiestoapp-site | feat: initial site (minimalista inicial) |
| `98dbccf` | manifiestoapp-site | feat: import polished site from main repo + adapt to manifiestoapp.com |

## Verificación end-to-end

| Capa | Verificación | Status |
|---|---|---|
| DNS | `dig manifiestoapp.com +short` → IPs de Cloudflare | ✅ |
| TLS | `curl -sI https://manifiestoapp.com/` → HTTP 200 + cert válido | ✅ |
| Privacy URL | `curl ... /privacy/` → 21 KB con título "Política de privacidad" + `soporte@manifiestoapp.com` | ✅ |
| Terms URL | `curl ... /terms/` → 20 KB con título "Términos de uso" | ✅ |
| Email forwarding | Mensaje test desde mail externo → llegó a gmail | ✅ |
| Mobile About screen | Rows Privacy + Terms visibles, links abren Safari con la URL real | ✅ verified en device del owner |
| Mobile Soporte | Tap "Contactar soporte" abre Mail con `soporte@manifiestoapp.com` + body pre-poblado | ✅ verified en device del owner |

## Lo que esto desbloquea para Apple submit

Items H1 + H2 del ready-pendientes **cerrados**. Resto pendiente:

| # | Item | Effort estimado | Status |
|---|---|---|---|
| H3 | Screenshots App Store (6.7" + 5.5" iPhone) | 1-2 d self / USD 100-300 contratado | 🔴 pendiente |
| ~~H4~~ | ~~Privacy Nutrition labels~~ | — | ✅ **DONE 2026-06-10 noche** |
| H5 | Listing copy (descripción es-MX + keywords) | 2-4 h | 🔴 pendiente |
| ~~H6~~ | ~~Age rating survey~~ | — | ✅ **DONE 2026-06-10 noche** (4+ en 173 países) |
| H7 | App Preview video (opcional pero recomendado) | 1 d | 🟡 opcional |
| H8 | Submit for Review + esperar Apple | 1 click + 1-3 días | 🔴 final |

## Referencias

- [Milestone Apple Dev setup (2026-06-09)](2026-06-09-apple-dev-setup-completed.md)
- [Runbook release automation](../operaciones/runbook-release-automation.md)
- Repo del sitio: https://github.com/kontosmario/manifiestoapp-site
- Sitio LIVE: https://manifiestoapp.com
