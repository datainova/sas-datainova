# Onboarding — Guia de Implementação Frontend (DataInova)

> Documento para o time de **Frontend** implementar a **tela/fluxo de Onboarding** exibido **imediatamente após o login**. Foco em **experiência imersiva (WOW)** com **Framer Motion**, acessibilidade, performance e aderência às **diretrizes de marca** (Jaapokki, Exo 2, brand `#2d2926`).

Stack de referência: **React + TypeScript + Tailwind + Framer Motion + React Hook Form (RHF) + Zod + React Query**.

---

## 1. Objetivo & Escopo

- Guiar o usuário na **configuração inicial** da empresa em passos curtos: **Nome**, **País**, **Segmento**, **Porte**, **Missão**, **Visão**, **Resumo**.
- **Obrigatório no primeiro acesso** (bloqueante) e **retomável** (autosave por passo).
- Entregar visual **imersivo** e **sofisticado**, alinhado ao WOW: transições fluidas, microinterações e foco na clareza executiva.

> **Observação:** os contratos de backend/armazenamento já estão documentados em `/docs`. Este guia não cita rotas específicas.

---

## 2. Anatomia do Wizard (Onboarding)

```
┌ Header ───────────────────────────────────────────┐
│ H1 (Jaapokki) + Subtexto  |  Stepper (com ticks) │
├ Body ─────────────────────────────────────────────┤
│ Form do passo + Sugestões (quando houver)         │
├ Footer ───────────────────────────────────────────┤
│ Voltar | Avançar/Concluir  ·  Autosave ⟳ “Salvo” │
└───────────────────────────────────────────────────┘
```

- **Stepper:** círculos numerados com **tick animado** ao completar; rótulos em desktop, somente estados em mobile.
- **Autosave:** indicador textual no footer (pulsar sutil ao salvar).

---

## 3. WOW Visual (Motion + Layers)

### Camadas (`z-index`)

1. **BackgroundImage** (tema tecnologia/inovação; blur 6–10px; `cover`)
2. **AnimatedGradient** (radiais/conic com opacidade baixa; ciclo lento 18–25s)
3. **LightOrbs** (orbs/luzes difusas muito sutis; `mix-blend-mode: screen`)
4. **Scrim Overlay** (semi-transparente para contraste; `bg-black/40` em dark, `bg-white/30` em light)
5. **WizardCard** (glassmorphism: `bg-white/10` + `backdrop-blur-md` + borda `white/20`)

### Framer Motion

- **Passo:** `initial { opacity: 0, y: 8 }`, `animate { opacity: 1, y: 0 }`, `exit { opacity: 0, y: -8 }`, `duration 0.28s`, `ease [0.16, 1, 0.3, 1]`.
- **Tick do stepper:** `scale 0.7 → 1.0` com `spring { stiffness: 380, damping: 28 }`.
- **Autosave pulse:** opacidade `0.6 → 1.0` por 600 ms ao concluir o save.
- **Conclusão:** “celebração sutil” (confetti-lite ≤ 120 partículas, 1.2 s) + cartão **Próximos Passos**.

### Acessibilidade

- Respeitar `prefers-reduced-motion`: manter apenas **fades**; desativar orbs/gradientes.

---

## 4. Passos & Validações (UI)

### P1 — Nome da empresa

- **Campo:** texto (2–120 caracteres).
- **Erro:** “Informe um nome com 2 a 120 caracteres.”
- **Dica:** evitar sufixos redundantes (LTDA, SA) — opcional.

### P2 — País

- **Select com busca** (lista ISO); sugestão inicial por **locale/IP** (editável).
- **Meta derivada:** timezone/moeda exibidos como **informação** (não editável aqui).

### P3 — Segmento

- **Combobox** com catálogo (Tecnologia, Varejo, Finanças…); aceitar novo termo (normalização visual).

### P4 — Porte

- **Opções:** 1–10 · 11–50 · 51–200 · 201–1.000 · 1.001+ (botões/pills com descrição curta).

### P5 — Missão

- **Textarea** 140–360 caracteres; contagem visível; placeholder executivo.

### P6 — Visão

- **Textarea** 140–360 caracteres; contagem visível; horizonte 3–5 anos.

### P7 — Resumo

- Cartões com cada etapa e **editar in-place** (abre o passo correspondente).
- **Check de consistência** (ícones verdes/vermelhos) — somente validações de UI.

> Todos os passos: validação com **Zod**; erros **inline** e focáveis.

---

## 5. Interações & Comportamentos

- **Autosave:** a cada 500 ms de inatividade e ao avançar/voltar.
- **Retomar sessão:** se o usuário sair, voltar ao **último passo válido** com os dados preenchidos.
- **Navegação:** `Alt + →` próximo passo, `Alt + ←` anterior; stepper clicável em desktop.
- **Exit guard:** confirmar saída se houver alterações não salvas (edge raro).
- **Conclusão:** consolidar dados, mostrar **cartão de confirmação** e CTA “Entrar no sistema”.

---

## 6. Integração com Diretrizes de Marca

- **Tipografia:** H1/H2 com **Jaapokki**; corpo/labels/botões com **Exo 2** (500/600).
- **Cores:** brand `#2d2926` no CTA primário e destaques; texto sobre brand sempre `#fff`.
- **Glassmorphism** consistente com a tela de Login WOW.

---

## 7. Componentes & Hooks a Implementar

- `OnboardingLayout` (camadas WOW + modo escuro)
- `OnboardingWizard` (shell + stepper + footer + autosave)
- Steps: `StepCompanyName`, `StepCountry`, `StepSegment`, `StepSize`, `StepMission`, `StepVision`, `StepReview`
- UI: `StepHeader`, `StepFooter`, `AutosaveIndicator`, `Stepper`, `ReviewCard`
- Utils: `useWizardSession()` (estado/restore/autosave), `useReducedMotion()`

> Forms com **RHF + Zod**; estado remoto/cache com **React Query** (sem expor rotas aqui).

---

## 8. Acessibilidade (WCAG AA)

- **Labels** explícitos; `aria-describedby` para mensagens de erro.
- **Foco visível** e ordem lógica; `aria-current="step"` no item do stepper.
- **Tamanho de alvo mínimo:** 44 × 44 px em botões.
- **Contraste:** texto normal ≥ 4.5:1; grandes ≥ 3:1.

---

## 9. Performance Budgets

- **Primeira pintura do wizard:** LCP < 2.0 s (rede 4G).
- **Troca de passo:** p95 < 180 ms, p99 < 250 ms.
- **JS por wizard:** ≤ 180 KB gzip (code-split por passo).
- **Imagens:** `.webp/.avif` ≤ 300 KB; preloading da BG.

---

## 10. Telemetria (Eventos)

- `onboarding_step_viewed`, `onboarding_step_completed`, `onboarding_completed`
- Opcionais: `onboarding_resume_used`, `onboarding_validation_error`, `onboarding_time_per_step_ms`

---

## 11. Microcopy (Sugestões)

- **Título geral:** “Configuração inicial da sua empresa”. Sub: “Leva menos de 2 minutos.”
- **Nome:** “Vamos começar pelo essencial.”
- **País:** “Onde sua empresa opera majoritariamente?”
- **Segmento:** “Em qual segmento sua empresa atua?”
- **Porte:** “Qual é o porte da sua empresa?”
- **Missão:** “Por que existimos?”
- **Visão:** “Onde queremos chegar em 3–5 anos?”
- **Resumo:** “Confira e conclua. Você poderá editar depois em Configurações.”

---

## 12. Integração com Backend (SaaS API)

- Endpoints autenticados (Bearer JWT):
  - `GET /v1/onboarding/sessions/active` → recupera a sessão ativa; se não existir retorna 404 (`E_ONBOARDING_NOT_FOUND`).
  - `POST /v1/onboarding/sessions` → cria uma nova sessão. Pode receber `state` inicial (mesmo shape descrito abaixo).
  - `GET /v1/onboarding/sessions/:id` → reidrata a sessão armazenada (retomar após refresh).
  - `PATCH /v1/onboarding/sessions/:id/step` → autosave; envia somente o payload do passo atual.
  - `POST /v1/onboarding/sessions/:id/complete` → conclui o onboarding e materializa os dados na organização.
- Shape do estado retornado (`state`):
  ```json
  {
    "answers": {
      "companyName": "DataInova Demo",
      "country": {
        "code": "BR",
        "name": "Brasil",
        "timezone": "America/Sao_Paulo",
        "currency": "BRL",
        "locale": "pt-BR"
      },
      "segment": { "value": "technology", "label": "Tecnologia" },
      "size": { "value": "SIZE_51_200", "label": "51–200 pessoas" },
      "mission": "Acelerar crescimento sustentavel.",
      "vision": "Ser referencia global em dados executivos.",
      "summary": "Resumo executivo opcional para o card final."
    },
    "completedSteps": ["welcome", "company", "country", "segment"],
    "lastCompletedAt": "2025-03-04T15:23:11.321Z"
  }
  ```
- Payload esperado por passo (`PATCH /step`):
  - `company` → `{ "companyName": "DataInova" }`
  - `country` → `{ "country": { "code": "BR", "name": "Brasil", "timezone": "America/Sao_Paulo", "currency": "BRL", "locale": "pt-BR" } }`
  - `segment` → `{ "segment": { "value": "technology", "label": "Tecnologia" } }` (se criar um termo novo, envie `value` slugificado em lower-case).
  - `size` → `{ "size": { "value": "SIZE_1_10", "label": "1–10 pessoas" } }` (enum disponível: `SIZE_1_10`, `SIZE_11_50`, `SIZE_51_200`, `SIZE_201_1000`, `SIZE_1001_PLUS`).
  - `mission` → `{ "mission": "texto 20-360 caracteres" }`
  - `vision` → `{ "vision": "texto 20-360 caracteres" }`
  - `review` → `{ "summary": "texto 20-400 caracteres" }`
- O backend mergeia incrementalmente `answers`, mantém `completedSteps` em ordem e devolve o estado consolidado em todas as respostas.
- Para completar (`POST /complete`), os passos `company`, `country`, `segment`, `size`, `mission` e `vision` precisam estar preenchidos; do contrário a API responde 409 (`E_ONBOARDING_INCOMPLETE`).
- Após a conclusão, a organização recebe:
  - `name`, `tz`, `currency`, `locale` (sobrescrevendo valores existentes, respeitando overrides enviados em `organization`).
  - `countryCode`, `countryName`, `segmentKey`, `segmentLabel`, `size`, `sizeLabel`, `mission`, `vision`, `summary` e `onboardingCompletedAt`.
- Sugestão de fluxo frontend:
  1. `GET /active` ao carregar o wizard; se 404, chamar `POST /sessions`.
  2. Guardar `id` em store (e opcionalmente em localStorage).
  3. Autosave (`PATCH /step`) a cada mudança relevante ou navegação.
  4. Ao finalizar, `POST /complete` e redirecionar para o dashboard.

---

## 13. Testes & Critérios de Aceite

- **Fluxo completo** em ≤ 90 s, com autosave funcionando.
- **Retomada:** fechar o navegador e voltar retoma do último passo com dados.
- **A11y:** teclado 100%; leitores anunciam erros e progresso.
- **WOW:** transições suaves; confetti-lite na conclusão (desativado se `prefers-reduced-motion`).
- **Performance:** budgets atendidos; sem *jank* visível.

---

## 14. Entregáveis do FE

- Componentes e páginas do onboarding, com **story** de estados (cada passo) e **gravação curta** (≤ 10 s) do fluxo.
- QA de acessibilidade/performance (relatório rápido).
- Toggle de **modo escuro** funcional e captura de tela (light/dark).

---

## 15. Observações Finais

- O formulário é o **protagonista**: efeitos visuais **nunca** devem competir com a leitura/entrada de dados.
- Manter consistência com o **Login WOW** (mesmas camadas/curvas/motion).
- Em caso de dúvida, priorizar **legibilidade**, **contraste** e **conforto visual**.
