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

Mobile-first. Breakpoints Tailwind padrão.
PWA instalável: `public/manifest.json` com ícones 192×512.
