-- Nettoyage des tables liées au système d'abonnement retiré (RevenueCat / paywall / trial / codes promo)
-- À exécuter une seule fois dans le SQL Editor du Dashboard Supabase
-- Projet : wwuxaoggbvgmyzcjlgfx

-- L'ordre est important : promo_code_uses référence promo_codes via clé étrangère
DROP TABLE IF EXISTS promo_code_uses CASCADE;
DROP TABLE IF EXISTS promo_codes CASCADE;
DROP TABLE IF EXISTS device_trials CASCADE;
