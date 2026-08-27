/* Stub de "server-only" para os testes.
 *
 * O pacote real existe só para o bundler do Next barrar um módulo de servidor
 * importado por código de cliente. No Vitest não há essa fronteira: tudo roda
 * no mesmo processo, e o import quebra a resolução ("Failed to resolve import
 * server-only").
 *
 * Aparece quando um componente de cliente é testado isoladamente e arrasta,
 * pela cadeia de imports, um módulo marcado como servidor — por exemplo o
 * seletor de canal de Anúncios, que vive no mesmo arquivo dos componentes que
 * importam as Server Actions do módulo.
 *
 * Isto NÃO afrouxa a fronteira em produção: o alias vale só para o Vitest
 * (ver vitest.config.mts). O build do Next continua usando o pacote de
 * verdade e continua reprovando importação indevida. */
export {};
