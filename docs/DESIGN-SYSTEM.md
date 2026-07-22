# Design System — Sinal Duplo

## Identidade visual

| Marca | Cor primária | Slug |
|-------|-------------|------|
| KARZI | `#E3131B` | `karzi` |
| WUWU | `#9B30D9` | `wuwu` |

**Gradiente assinatura:** `linear-gradient(135deg, #E3131B 0%, #9B30D9 100%)`

## Temas

| Tema | Nome interno | Trigger CSS |
|------|-------------|-------------|
| Claro | Vitrine | `:root` (default) |
| Escuro | Cabine | `.dark` |

## Tipografia

| Uso | Fonte | Peso |
|-----|-------|------|
| Headings | Sora | 600, 700 |
| Body | Inter | 400, 500 |

## Tokens CSS (`src/app/globals.css`)

```css
--karzi: #E3131B
--wuwu: #9B30D9
--gradient-signature: linear-gradient(135deg, #E3131B 0%, #9B30D9 100%)

/* Modo claro */
--background: #FFFFFF
--foreground: #0E0F13
--card: #F8F8FA
--muted: #F1F1F5

/* Modo escuro (.dark) */
--background: #0E0F13
--foreground: #F8F8FA
--card: #16181E
--muted: #1E2028
```

## Componentes base

Todos via shadcn/ui + Tailwind v4. Extensões:
- `BrandBadge` — exibe pill com cor da marca (karzi/wuwu)
- `GradientButton` — botão primário com gradiente assinatura
- `ThemeToggle` — alterna Vitrine/Cabine
- `StatusBadge` — cor semântica por status de pedido/conversa

## Animações

Framer Motion para:
- Transições de página (fade + slide)
- Cards de scoring (contador animado)
- Modais e drawers

## Responsividade

Mobile-first. A implementação pode usar os breakpoints do Tailwind, mas o aceite de cada tela
deve ser executado nos quatro viewports oficiais do PRD:

| Projeto de teste | Viewport | Cenário de referência |
|---|---:|---|
| `mobile-360` | 360 × 640 | celular compacto |
| `tablet-768` | 768 × 1024 | tablet em retrato |
| `notebook-1024` | 1024 × 768 | tablet em paisagem / notebook |
| `wide-1920` | 1920 × 1080 | desktop amplo |

O portão responsivo roda no CI com Playwright autenticado por meio de
`npm run test:e2e:phase-a`. Todas as rotas da Fase A devem carregar sem overflow horizontal,
overlay de erro ou perda da navegação principal nos quatro projetos.
PWA instalável: `public/manifest.json` com ícones 192×512.
