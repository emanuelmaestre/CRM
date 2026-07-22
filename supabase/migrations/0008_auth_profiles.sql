-- Normaliza o estado do usuário para boolean, evitando valores textuais inválidos.
-- Rollback: ALTER TABLE app_user ALTER COLUMN ativo TYPE text USING ativo::text;
--           ALTER TABLE app_user ALTER COLUMN ativo SET DEFAULT 'true';

ALTER TABLE app_user ALTER COLUMN ativo DROP DEFAULT;
ALTER TABLE app_user
  ALTER COLUMN ativo TYPE boolean
  USING CASE
    WHEN lower(trim(ativo)) IN ('true', '1', 'yes', 'sim', 'ativo') THEN true
    ELSE false
  END;
ALTER TABLE app_user ALTER COLUMN ativo SET DEFAULT true;
