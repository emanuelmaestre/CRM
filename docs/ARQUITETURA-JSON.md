# Arquitetura de interface orientada a JSON

O conteúdo estático da interface fica em `src/config/*.json`. Os componentes
TSX são a camada executável: renderizam os contratos, controlam estado, chamam
ações de servidor e integram autenticação, banco de dados e animações.

## Contratos

- `app.json`: identidade, idioma, metadados e textos compartilhados.
- `brands.json`: marcas, cores e classes dos chips.
- `navigation.json`: rotas, rótulos, ícones e disponibilidade móvel.
- `pages.json`: conteúdo de login, listas, inbox e movimento de estoque.
- `wizards.json`: etapas, campos, validações e mensagens dos cadastros.
- `dashboard.json`: cards, KPIs, gráfico e dados demonstrativos do painel.
- `reports.json`: canais, estados, exportações e conteúdo dos relatórios.
- `settings.json`: seções, integrações e estados vazios das configurações.

Os nomes de ícone usados nos JSON são resolvidos por
`src/shared/config/icon-registry.ts`. Esse adaptador é necessário porque JSON
não pode armazenar componentes React ou funções.

## Limite intencional

Regras de negócio, validação estrutural, efeitos, eventos, acesso a variáveis de
ambiente e chamadas ao banco continuam em TypeScript/TSX. Converter código
executável em JSON removeria tipagem, segurança e comportamento; por isso o JSON
é a fonte de dados da interface, não um substituto da camada React/Next.js.

## Validação

`src/test/domain/json-ui-config.test.ts` garante rotas únicas, ícones registrados,
marcas consistentes e assistentes com etapas completas. Além disso, o projeto deve
passar por `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`.
