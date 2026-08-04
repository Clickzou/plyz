-- Prolongation d'une séance de dédicace (2026-08-04)
--
-- L'endpoint /api/extend-event-session lit et écrit `extended_minutes` pour
-- appliquer le plafond de 2 h de rallonge CUMULÉE. Le compteur est indispensable :
-- `ends_at` est écrasé à chaque prolongation, donc sans lui l'heure de fin initiale
-- serait perdue et on pourrait prolonger indéfiniment — l'argent des fans restant
-- bloqué en pré-autorisation tout ce temps.
--
-- Appliqué en production le 2026-08-04. Idempotent.

ALTER TABLE public.event_sessions
  ADD COLUMN IF NOT EXISTS extended_minutes integer NOT NULL DEFAULT 0;

-- Vérification
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'event_sessions' AND column_name = 'extended_minutes';
