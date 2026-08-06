-- LE MUR DES CÉLÉBRITÉS EST RÉSERVÉ AUX PROFILS VÉRIFIÉS
--
-- Pourquoi : l'écran « Découvrir » liste les profils dont `is_listed` vaut vrai
-- — et cette colonne valait vrai PAR DÉFAUT, sans que rien ne l'écrive jamais.
-- Autrement dit : activer le mode célébrité suffisait à apparaître publiquement
-- comme célébrité, sans la moindre validation. N'importe qui pouvait se déclarer
-- « Zidane » et figurer sur le mur en trois clics.
--
-- Constaté en vrai : deux profils non vérifiés étaient visibles des utilisateurs
-- — un compte de test et le compte du testeur Google Play.
--
-- La règle est posée EN BASE, pas seulement dans le serveur : le profil est créé
-- par l'application (écriture Supabase directe), le serveur ne fait que lire.
--
-- À exécuter dans Supabase → SQL Editor.

-- 1) Plus personne n'est listé d'office.
ALTER TABLE public.celebrity_profiles ALTER COLUMN is_listed SET DEFAULT false;

-- 2) Garde-fou : `is_listed` suit la vérification, dans les deux sens.
--    - non vérifié  -> jamais listé
--    - vérifié      -> listé automatiquement, sinon une célébrité validée
--                      resterait introuvable sans que personne ne comprenne
--                      pourquoi (elle n'a aucun réglage pour se lister).
CREATE OR REPLACE FUNCTION public.celeb_listing_suit_verification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if coalesce(NEW.official_verified, false) then
    -- Vérifié : on liste, sauf si le profil vient d'être explicitement retiré
    -- (masquage volontaire par un administrateur sur cette même écriture).
    if TG_OP = 'INSERT' then
      NEW.is_listed := true;
    elsif OLD.official_verified is distinct from NEW.official_verified then
      NEW.is_listed := true;
    end if;
  else
    NEW.is_listed := false;
  end if;
  return NEW;
end $$;

DROP TRIGGER IF EXISTS trg_celeb_listing_suit_verification ON public.celebrity_profiles;
CREATE TRIGGER trg_celeb_listing_suit_verification
BEFORE INSERT OR UPDATE ON public.celebrity_profiles
FOR EACH ROW EXECUTE FUNCTION public.celeb_listing_suit_verification();

-- 3) Retrait immédiat des profils non vérifiés déjà visibles.
UPDATE public.celebrity_profiles
   SET is_listed = false
 WHERE coalesce(official_verified, false) = false
   AND is_listed is distinct from false;

-- 4) Contrôle : qui reste visible ?
SELECT stage_name, official_verified, is_listed
  FROM public.celebrity_profiles
 ORDER BY is_listed DESC, stage_name;
