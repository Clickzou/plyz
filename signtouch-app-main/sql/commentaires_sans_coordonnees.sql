-- ---------------------------------------------------------------------------
--  Ni lien ni numéro de téléphone dans les commentaires
-- ---------------------------------------------------------------------------
--
--  L'application refuse déjà ces commentaires avant de les envoyer, et elle le
--  dit avec sa raison. Mais un refus qui ne vit que dans l'application n'est
--  pas une règle : il suffit d'appeler la base directement — la clé publique
--  est dans l'app, par construction — pour écrire ce qu'on veut.
--
--  Ce que ça ferme concrètement : le faux compte qui répond sous la
--  publication d'une star, en se faisant passer pour son équipe, avec un
--  numéro WhatsApp ou un lien « pour gagner une dédicace ». Les fans qui
--  suivent y laissent leur argent, et c'est la réputation de la star qui paie.
--
--  ⚠️ Cette règle ne vaut QUE pour les commentaires. Les personnalités gardent
--  le droit de mettre un lien dans le descriptif de leurs événements — une
--  billetterie, une page officielle : c'est légitime, et la création
--  d'événement est déjà réservée aux comptes vérifiés.
--
--  À exécuter dans l'éditeur SQL de Supabase.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refuser_coordonnees_commentaire()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  texte text := coalesce(NEW.body, '');
  chiffres text;
BEGIN
  -- 1. Adresses en clair : http://, https://, ftp://, www.
  IF texte ~* '(https?|ftp)://' OR texte ~* '\ywww\s*[.\[(]' THEN
    RAISE EXCEPTION 'Les liens ne sont pas autorisés dans les commentaires.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. domaine.extension. La liste est fermée : un « \.[a-z]{2,} » général
  --    refuserait « Merci. Super » ou « c'est top.merci ».
  IF texte ~* '\y[a-z0-9][a-z0-9-]+\s*\.\s*(com|fr|net|org|io|co|me|tv|app|shop|xyz|info|biz|ru|de|es|it|uk|be|ch|ca|us|link|page|site|online|store|club|live|gg|ly|to|cc|top|vip|fun|bio)\y' THEN
    RAISE EXCEPTION 'Les liens ne sont pas autorisés dans les commentaires.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Les déguisements courants : « exemple point com », « exemple (dot) com »,
  --    « exemple [.] com ».
  IF texte ~* '\y[a-z0-9-]{2,}\s*[\(\[]?\s*(point|dot|punto|punkt)\s*[\)\]]?\s*(com|fr|net|org|io|co|me|tv|app)\y'
     OR texte ~* '[a-z0-9-]{2,}\s*[\(\[]\s*\.\s*[\)\]]\s*[a-z]{2,}' THEN
    RAISE EXCEPTION 'Les liens ne sont pas autorisés dans les commentaires.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. Numéro de téléphone : au moins huit chiffres dans une même suite, où
  --    seuls des séparateurs les séparent. Le seuil de huit laisse passer ce
  --    qui n'est pas un numéro — une année, un prix, un score, une heure.
  --    Les séparateurs sont retirés AVANT de compter : « 06 12 34 56 78 » et
  --    « 0612345678 » sont le même numéro, et c'est bien ainsi qu'on le
  --    déguise.
  --
  --    Une suite qui n'est RIEN D'AUTRE qu'une date est laissée tranquille :
  --    « rendez-vous le 07/08/2026 » compte huit chiffres, et annoncer une
  --    date sous l'annonce d'un événement est exactement ce qu'on attend d'un
  --    commentaire. La date est reconnue sur la suite ENTIÈRE et jamais
  --    retirée au milieu du texte : découper d'abord laissait passer
  --    « 06.12.34.56.78 », dont les trois premiers groupes ressemblent à une
  --    date.
  FOR chiffres IN
    SELECT (regexp_matches(texte, '(?:\+?[0-9][\s.\-/()]{0,2}){8,}', 'g'))[1]
  LOOP
    CONTINUE WHEN chiffres ~ '^\s*[0-9]{1,2}\s*[./-]\s*[0-9]{1,2}\s*[./-]\s*[0-9]{2,4}\s*$';
    IF length(regexp_replace(chiffres, '[^0-9]', '', 'g')) >= 8 THEN
      RAISE EXCEPTION 'Les numéros de téléphone ne sont pas autorisés dans les commentaires.'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commentaire_sans_coordonnees ON public.post_comments;
CREATE TRIGGER trg_commentaire_sans_coordonnees
BEFORE INSERT OR UPDATE OF body ON public.post_comments
FOR EACH ROW
EXECUTE FUNCTION public.refuser_coordonnees_commentaire();

-- ---------------------------------------------------------------------------
--  Vérification — à passer une fois, juste après l'installation.
--  Les trois premières doivent ÉCHOUER, la dernière doit passer.
-- ---------------------------------------------------------------------------
--
--  SELECT public.refuser_coordonnees_commentaire();  -- ne s'appelle pas seule
--
--  Test à la main, avec un post_id et un author_id réels :
--    INSERT INTO public.post_comments (post_id, author_id, body)
--    VALUES ('<post>', '<user>', 'Écris-moi sur https://arnaque.example');   -- refusé
--    ... VALUES ('<post>', '<user>', 'Mon numéro : 06 12 34 56 78');         -- refusé
--    ... VALUES ('<post>', '<user>', 'Rdv sur insta point com');             -- refusé
--    ... VALUES ('<post>', '<user>', 'Trop bien ! Rendez-vous le 12 août.'); -- accepté
-- ---------------------------------------------------------------------------
