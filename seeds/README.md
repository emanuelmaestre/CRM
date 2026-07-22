# Seed sintético

O arquivo `synthetic.json` é a fonte única da massa fictícia usada em desenvolvimento, CI e staging.
Ele não contém credenciais, tokens, CPF/CNPJ nem endereços de e-mail entregáveis. Contas de canal são
criadas desconectadas e marcadas com `externalSendsEnabled: false`.

## Uso local

Com `DATABASE_URL` apontando para um banco local já migrado:

```sh
npm run db:seed:synthetic
npm run test:seed-synthetic
```

`SYNTHETIC_SEED_ANCHOR_DATE=YYYY-MM-DD` fixa a data de referência. Sem ela, o seed usa o dia atual.
A carga é idempotente e pode ser executada novamente.

## Staging remoto

Uma execução remota exige simultaneamente:

```text
SYNTHETIC_SEED_ENV=staging
SYNTHETIC_SEED_REMOTE_CONFIRMATION=seed-synthetic-data
```

Qualquer sinal explícito de produção (`SYNTHETIC_SEED_ENV`, `APP_ENV` ou `VERCEL_ENV`) bloqueia a carga. O seed nunca deve
ser executado no banco de produção.
