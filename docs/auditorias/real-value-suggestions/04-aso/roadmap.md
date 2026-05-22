# 04 · ASO — Roadmap

> Secuencia de ejecución desde 0 hasta listing live en App Store.

---

## 🏁 Sprint 1 · Textos + URLs (2-3 días)

### TASK 4.1-4.6 · Metadata textual

**Effort:** 1 día redacción + iteración

**Pasos:**
1. Decidir entre opciones A/B/C del audit (yo recomiendo A en todo)
2. Validar en Apple App Store Connect que no haya conflicto con app existente con mismo name (raro pero posible)
3. Subir a App Store Connect → Apps → Manifiesto → 1.0 → App Store Information

**Checklist:**
- [ ] App Name: `Manifiesto: Gastos en Pareja` (28 chars)
- [ ] Subtitle: `Control financiero del hogar` (28 chars)
- [ ] Promotional Text: copy del audit (157 chars)
- [ ] Description full (~2400 chars) en es-AR
- [ ] Keywords: `gastos,pareja,hogar,familia,presupuesto,ahorro,plata,finanzas,cuotas,economia,dinero,alquiler` (99 chars)
- [ ] What's New v1.0: "Esta es la primera versión de Manifiesto. ¡Gracias por subirte al hogar más ordenado del país! 💛"

**DoD:** todas las metadatas en App Store Connect, pasar verificación de char limits.

---

### TASK 4.13-4.16 · Categorización + age

**Effort:** 15 minutos

1. Primary: Finance · Secondary: Lifestyle
2. Age Rating: 4+
3. Content Rating questionnaire: todo "None" (sin contenido adult)
4. Trade Representative Contact Information: tus datos como dev

---

### TASK 4.17 · Privacy Nutrition Label

**Effort:** 1 hora

App Store Connect → App Privacy → Edit → completar según matrix del audit.

Categorías a declarar:
- Contact Info → Email (linked, used for App Functionality + Account)
- Health & Fitness → None
- Financial Info → User's transactions: "Other Financial Info" (sí, gastos = financial)
  - Linked: Yes · Tracking: No · Used For: App Functionality, Analytics, Product Personalization
- Location → None
- Sensitive Info → None
- Contacts → None
- User Content → User-generated content: Yes (gastos, categorías, notas)
- Browsing History → None
- Search History → None
- Identifiers → User ID: Yes (auth.users.id)
- Purchases → Purchase History: Yes (IAP transactions)
- Usage Data → Product Interaction: Yes
- Diagnostics → Crash data, Performance data: Yes (cuando Sentry esté wired)
- Other Data → None

---

### TASK 4.18 · Encryption compliance

**Effort:** 5 minutos

En `app.config.ts`:
```ts
ios: {
  // ...
  config: {
    usesNonExemptEncryption: false,
  },
}
```

Esto evita que cada submit te pregunte por export compliance.

---

### TASK 4.19 · Support URL

**Effort:** 30 minutos

Crear página estática `manifiesto.app/soporte` con:
- Email mailto link
- FAQ corto (puede ser igual que FAQ del billing-screen)
- Link a Privacy + Terms
- Versión + cómo reportar bug

Si todavía no tenés dominio: usar un Notion público temporalmente.

---

## 🏁 Sprint 2 · Visual assets (3-5 días)

### TASK 4.8-4.10 · Screenshots

**Effort:** 2-3 días si los hacés vos · 💰 BUDGET si tercerizás

**Workflow:**
1. **Crear plantilla en Figma** con:
   - Frame 1290×2796
   - Slots: headline arriba, sub debajo, mockup iPhone abajo
   - Layer style con shadows, blurs sutiles
2. **Capturar screens reales** de la app (use dev build, datos pulcros):
   - Cargar gastos de demo coherentes
   - Configurar familia con María como partner
   - Avanzar racha a 23 días
   - Screenshots vía iPhone Simulator (mejor resolución que físico)
3. **Compose en Figma** los 10 frames del audit
4. **Export** PNG sRGB → carpeta `assets/store/screenshots/6.7/`
5. **Upload** App Store Connect → 1.0 → App Previews and Screenshots
6. **Repetir para 6.5"** (puede hacerse mismas composiciones a 1284×2778 con resize)

**Tools de aceleración:**
- [Mockuuups Studio](https://mockuuups.studio) — drag & drop mockups
- [Hotpot.ai App Screenshot Generator](https://hotpot.ai/templates/app-store-screenshots) — templates
- [Screenshots.pro](https://screenshots.pro) — $30 generator from templates
- [Previewed.app](https://previewed.app) — más customizable

💰 **BUDGET:** $0 + tu tiempo, ó $30 plantilla, ó $200-500 tercerizado.

---

### TASK 4.11 · App Preview Video

**Effort:** 1-2 días · **Postpone si stretchear:** opcional pero **aumenta conversion ~15%**

**Workflow DIY:**
1. **Storyboard** según guión del audit (15-30s, 10 escenas)
2. **Screen recording** en iPhone Simulator (mejor que físico):
   - QuickTime → File → New Movie Recording → seleccionar Simulator
   - O `xcrun simctl io booted recordVideo`
3. **Captura audio narration** opcional (tu voz o licensed VO)
4. **Editing** en iMovie (gratis Mac) o CapCut (gratis crossplatform) o DaVinci Resolve
5. **Música** licensed: Artlist $9.99/mes o Soundstripe similar
6. **Export** 1080×1920 MP4 H.264
7. **Validar:** App Store Connect rechaza videos > 30s o con watermark de terceros

💰 BUDGET: $0-50 (música) si DIY · $100-300 tercerizado.

---

### TASK 4.12 · Marketing imagery

**Effort:** 1 día post-screenshots

Versiones reutilizables para:
- Twitter/X header
- Instagram posts
- Hero de la landing manifiesto.app
- Blog posts

Plantilla similar a screenshots pero adaptada por aspect ratio.

---

## 🏁 Sprint 3 · Pre-submit validation (1 día)

### Checklist de submission

- [ ] App Name, Subtitle, Promotional Text, Description, Keywords (en es-AR)
- [ ] What's New text
- [ ] App Icon (1024×1024 PNG, no transparency) — ya tenés ✅
- [ ] Screenshots 6.7" (3-10) ✅ post sprint 2
- [ ] Screenshots 6.5" (3-10) — recomendado, no obligatorio
- [ ] App Preview Video (opcional pero recomendado)
- [ ] Primary Category: Finance · Secondary: Lifestyle
- [ ] Age Rating 4+
- [ ] Privacy Nutrition Label completo
- [ ] Privacy Policy URL (← depende de sección 01)
- [ ] Support URL
- [ ] Encryption declaration
- [ ] Pricing schedule (Free + IAP products configured)
- [ ] Build subido vía EAS / Xcode con .ipa válido
- [ ] TestFlight pasó internal testing (≥ 3 testers reportaron OK)

---

## 🏁 Sprint 4 · Submit + iteration (1-2 semanas)

### Submit

1. App Store Connect → 1.0 → "Submit for Review"
2. Responder preguntas de Review Notes:
   - Demo account credentials (crear `review@manifiesto.app` con familia + datos)
   - Notes técnicas: "App requiere conexión a internet; auth via email password o Apple Sign-In"
   - IAP testing notes: "Use sandbox account ___, products are auto-renewable subscriptions"

### Tiempo típico de review
- 24-48h en review activo
- 7 días máximo según Apple
- Rechazos suelen pedir clarification, no rebuild

### Common rejection reasons + mitigation

| Reason | Mitigation |
|--------|------------|
| 4.8 Sign in with Apple parity | Cubrí en sección 01 |
| 5.1.1(v) Delete Account | Cubrí en sección 01 |
| 2.3 Performance / Crashes | Sentry + QA |
| 3.1.1 IAP not visible | Asegurar paywall visible desde Settings |
| 3.1.2 Subscription terms | Trust pills + fine print en billing-screen |
| 1.5 Developer contact | Support URL funcional |
| 4.0 Design / spam | Calidad de UI (Manifiesto está OK) |
| 5.1.1(i) Privacy missing | Privacy Policy URL + label |

---

## 🏁 Sprint 5 · Post-launch optimization (continuous)

### TASK 4.26 · Strategy de reviews

**Effort:** 1 día setup

```ts
// mobile/features/ratings/use-rating-prompter.ts
import * as StoreReview from 'expo-store-review'

export function useMaybePromptRating() {
  const events = useUserEvents()
  
  useEffect(() => {
    const conditions = [
      events.cycleClosedUnderBudget,   // momento de mood positivo
      events.streakReached >= 30,
      events.sessionsThisMonth >= 8,
      events.daysSinceInstall >= 14,
    ]
    
    if (conditions.every(Boolean) && !events.alreadyPromptedThisYear) {
      StoreReview.requestReview()
      markPrompted()
    }
  }, [events])
}
```

Mount en Home screen. Apple gestiona el rate limit automáticamente.

---

### TASK 4.27 · A/B testing

**Effort:** ongoing · **Tool:** Apple Custom Product Pages

Setup en App Store Connect:
1. Crear 2-3 Custom Product Pages
2. Variar primer screenshot
3. Variar subtitle
4. Track via App Store Analytics (CTR + conversion)
5. Cada test: mínimo 7 días, 1000+ impressions cada variant para significance

---

### TASK 4.28 · Keyword ranking tracker

**Effort:** 1 hora setup · 💰 BUDGET tool

Tools:
- **AppFollow** ($23/mes) — keyword tracking, review monitoring
- **Sensor Tower** ($79+/mes) — enterprise level
- **App Annie / data.ai** — caro pero completo
- **Apptopia** — datos generales
- **Manual:** App Store search por keyword + ver posición

Para empezar (mes 1-3 post-launch): manual check semanal de 5-10 keywords es suficiente. Después AppFollow.

---

### TASK 4.29 · Apple Search Ads

**Effort:** 1 día setup + ongoing optimization · 💰 BUDGET

**Phase 1 — Discovery campaign:**
- Budget: $5-10/día
- Match type: broad
- Apple sugiere keywords automáticamente
- Run 2 semanas, observar qué keywords convierten

**Phase 2 — Optimized exact-match:**
- Bid manualmente en keywords identificadas como top performers
- Budget: $15-30/día
- CPA target: depende de LTV (max $10 por install para tier free, max $30 por trial start)

**Phase 3 — Competitive bidding:**
- Bidear en keywords de Splitwise, YNAB, Mobills, etc.
- Costoso pero atrae usuarios con intent clara

Tracking: Apple Search Ads dashboard + correlación con install attribution.

---

### TASK 4.21-4.25 · Localización Latam expansion

**Effort por locale:** 2 horas adaptación + 0.5 días screenshots translation

**Phase 1 (v1.0):** es-AR única
**Phase 2 (v1.1):** sumar es-MX + es-ES + es-CO
**Phase 3 (v2.0):** en-US (requiere i18n in-app)

Por cada locale en App Store Connect:
- App Name, Subtitle, Promotional Text, Description, Keywords (locale-specific)
- Screenshots con textos traducidos
- Mismo App Icon

⚠️ Cuidado: **localización de la app != localización del listing**. Podés tener listing en MX sin app traducida (si todo es ES neutral). Pero idealmente ambos.

---

## 📅 Cronograma sugerido

| Semana | Foco | Tasks |
|--------|------|-------|
| **W1** | Textos + URLs + categorización | 4.1-4.6, 4.13-4.20 |
| **W2** | Screenshots production | 4.8-4.10 |
| **W3** | Video + marketing assets | 4.11, 4.12 |
| **W4** | Pre-submit validation + submit | All checklist + submission |
| **W5-6** | Review back-and-forth + go-live | Iterar según Apple feedback |
| **Post-launch** | Tracking + iteration | 4.26-4.28 ongoing, 4.29 cuando tengas budget |
| **Mes 3+** | Latam expansion | 4.21-4.25 progressively |

---

## ⚠️ Pitfalls comunes

1. **Subir build sin App Store Connect listing terminado**: error común. Hacé al revés: listing primero, build después.
2. **Screenshots con datos personales reales**: no uses tu propio gasto histórico — usá demo seed.
3. **Keywords con plurales/duplicados**: Apple rechaza si "gasto,gastos" aparecen juntos.
4. **App Preview Video con music sin licencia**: rejection automático.
5. **Promotional Text al límite**: dejá margen para emojis (cada uno cuenta como 2-4 chars).
6. **No responder reviews <3★**: hurts ASO. Apple priorizá apps con engagement de developer.
7. **App Privacy declaration inaccurate**: si Apple detecta data flow no declarado, app rechazada Y se vuelve permanent risk.

---

**Próximo doc:** `budget.md`.
