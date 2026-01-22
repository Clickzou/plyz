# Guide de vérification et synchronisation Supabase

Ce guide te permet de vérifier que ta base de données Supabase est bien synchronisée avec ton code après avoir exporté ton projet depuis Bolt.

---

## État actuel de la base de données ✅

J'ai vérifié ta base de données Supabase et voici l'état actuel :

### ✅ Table `memories` (Créée)

**Colonnes** :
- `id` (uuid, primary key) - Identifiant unique
- `user_id` (uuid, not null) - Référence vers auth.users
- `image_path` (text, not null) - Chemin de l'image dans storage
- `thumbnail_path` (text, nullable) - Chemin de la miniature
- `timestamp` (bigint, not null) - Timestamp de création
- `updated_at` (bigint, nullable) - Timestamp de mise à jour
- `signature_overlays` (jsonb, nullable, default '[]') - Signatures appliquées
- `filter` (text, nullable) - Filtre appliqué
- `adjustments` (jsonb, nullable) - Ajustements (luminosité, contraste, etc.)
- `is_edited` (boolean, nullable, default false) - Indique si édité
- `created_at` (timestamptz, nullable, default now()) - Date de création

**RLS activé** : ✅ Oui

**Policies configurées** : ✅ 4 policies
- "Users can view own memories" (SELECT)
- "Users can create own memories" (INSERT)
- "Users can update own memories" (UPDATE)
- "Users can delete own memories" (DELETE)

Toutes les policies vérifient que `auth.uid() = user_id`, ce qui garantit que chaque utilisateur ne peut accéder qu'à ses propres données.

### ✅ Bucket Storage `memories` (Créé)

**Configuration** :
- Nom : `memories`
- Public : Non (privé)
- Limite de taille : Aucune
- Types MIME autorisés : Tous

Ce bucket est utilisé pour stocker :
- Les images originales et signées
- Les miniatures

### ✅ Migration appliquée

**Migration** : `20260117221153_create_memories_schema.sql`

Cette migration a créé la table `memories` avec tous les champs nécessaires et les policies RLS.

---

## Vérification rapide

### Étape 1 : Vérifier l'état de la base de données

#### Depuis Supabase Dashboard

1. **Va sur [app.supabase.com](https://app.supabase.com)**
2. **Ouvre ton projet** : wwuxaoggbvgmyzcjlgfx
3. **Va dans "Table Editor"**
4. **Vérifie que la table `memories` existe** avec toutes les colonnes listées ci-dessus
5. **Va dans "Storage"**
6. **Vérifie que le bucket `memories` existe**

#### Depuis le code

Ta base de données est **déjà synchronisée** avec ton code ! Tous les fichiers utilisent la bonne structure :

- ✅ `utils/memoriesStorage.ts` - Interface TypeScript correspond
- ✅ `utils/cloudStorage.ts` - Utilise le bon schéma de table et bucket

---

## Comment synchroniser après des modifications

### Si tu modifies le code dans Bolt et tu exportes à nouveau

Tu pourrais avoir besoin de créer de nouvelles migrations si tu ajoutes/modifies des fonctionnalités.

#### Scénario 1 : Tu ajoutes une nouvelle colonne à `memories`

Par exemple, ajouter une colonne `tags` :

```sql
ALTER TABLE memories
ADD COLUMN tags text[] DEFAULT '{}';
```

Tu devrais créer une nouvelle migration :

1. **Va sur Supabase Dashboard** → SQL Editor
2. **Exécute le SQL ci-dessus**
3. **Ou utilise l'outil de migration** (voir section suivante)

#### Scénario 2 : Tu ajoutes une nouvelle table

Par exemple, une table `favorites` :

1. **Crée la migration SQL** avec la structure complète
2. **Active RLS** avec `ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;`
3. **Crée les policies** pour SELECT, INSERT, UPDATE, DELETE
4. **Exécute dans SQL Editor**

---

## Créer une nouvelle migration manuellement

Si tu as besoin de créer une nouvelle migration après avoir exporté depuis Bolt :

### Méthode 1 : Via Supabase Dashboard (Recommandé)

1. **Va sur Supabase Dashboard** → SQL Editor
2. **Clique sur "New query"**
3. **Écris ton SQL** :

```sql
/*
  # Ajouter la colonne tags aux memories

  1. Modifications
    - Ajoute la colonne `tags` (text array)

  2. Valeur par défaut
    - Array vide
*/

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
```

4. **Clique sur "Run"**
5. **Supabase enregistre automatiquement la migration**

### Méthode 2 : Via CLI Supabase (Avancé)

Si tu veux gérer les migrations localement :

```bash
# Installer Supabase CLI
npm install -g supabase

# Initialiser dans ton projet
supabase init

# Lier ton projet distant
supabase link --project-ref wwuxaoggbvgmyzcjlgfx

# Récupérer les migrations existantes
supabase db pull

# Créer une nouvelle migration
supabase migration new add_tags_to_memories

# Éditer le fichier créé dans supabase/migrations/

# Appliquer la migration
supabase db push
```

---

## Exporter le schéma actuel (pour référence)

Si tu veux avoir une copie locale de ton schéma actuel :

### Via Supabase Dashboard

1. **Va sur Supabase Dashboard** → SQL Editor
2. **Exécute cette requête** :

```sql
-- Schéma de la table memories
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'memories'
ORDER BY ordinal_position;

-- Policies RLS
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

3. **Copie les résultats** et sauvegarde-les dans un fichier local `supabase-schema-backup.json`

### Via CLI

```bash
# Exporter tout le schéma
supabase db dump -f supabase-schema.sql --project-ref wwuxaoggbvgmyzcjlgfx

# Ou exporter seulement les données
supabase db dump --data-only -f supabase-data.sql --project-ref wwuxaoggbvgmyzcjlgfx
```

---

## Comparer le code avec la base de données

### Vérifier que les interfaces TypeScript correspondent

#### 1. Interface `Memory` dans `memoriesStorage.ts`

```typescript
export interface Memory {
  id: string;
  uri: string;
  baseUri?: string;
  timestamp: number;
  updatedAt?: number;
  signatureOverlays?: SignatureOverlay[];
  filter?: string;
  adjustments?: PhotoAdjustments;
  isEdited?: boolean;
}
```

✅ **Correspond à la table** : Les champs correspondent (avec des noms légèrement différents pour suivre les conventions JS vs SQL)

#### 2. Interface `CloudMemory` dans `cloudStorage.ts`

```typescript
interface CloudMemory {
  id: string;
  user_id: string;
  image_path: string;
  thumbnail_path: string | null;
  timestamp: number;
  updated_at: number | null;
  signature_overlays: SignatureOverlay[];
  filter: string | null;
  adjustments: PhotoAdjustments | null;
  is_edited: boolean;
  created_at: string;
}
```

✅ **Correspond exactement** : Cette interface reflète exactement le schéma SQL

### Checklist de vérification

- [x] La table `memories` existe dans Supabase
- [x] Toutes les colonnes nécessaires sont présentes
- [x] RLS est activé
- [x] Les 4 policies sont configurées (SELECT, INSERT, UPDATE, DELETE)
- [x] Le bucket storage `memories` existe
- [x] Les interfaces TypeScript correspondent au schéma
- [x] Les fonctions `cloudStorage.ts` utilisent les bons champs

**✅ Tout est synchronisé !**

---

## Résoudre les problèmes courants

### Problème 1 : "relation 'memories' does not exist"

**Cause** : La table n'a pas été créée

**Solution** :
1. Va sur Supabase Dashboard → SQL Editor
2. Exécute ce SQL pour créer la table :

```sql
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  thumbnail_path text,
  timestamp bigint NOT NULL,
  updated_at bigint,
  signature_overlays jsonb DEFAULT '[]'::jsonb,
  filter text,
  adjustments jsonb,
  is_edited boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Activer RLS
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Créer les policies
CREATE POLICY "Users can view own memories"
  ON memories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own memories"
  ON memories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories"
  ON memories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories"
  ON memories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

### Problème 2 : "bucket 'memories' does not exist"

**Cause** : Le bucket storage n'a pas été créé

**Solution** :
1. Va sur Supabase Dashboard → Storage
2. Clique sur "New bucket"
3. Nom : `memories`
4. Public : **Non** (garde privé)
5. Clique sur "Create bucket"
6. Configure les policies storage :

```sql
-- Policy pour uploader ses propres images
CREATE POLICY "Users can upload own images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'memories' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy pour lire ses propres images
CREATE POLICY "Users can read own images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'memories' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy pour supprimer ses propres images
CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'memories' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Problème 3 : "new row violates row-level security policy"

**Cause** : L'utilisateur n'est pas authentifié ou les policies sont mal configurées

**Solution** :
1. Vérifie que l'utilisateur est bien connecté (`user` n'est pas null)
2. Vérifie que `user_id` dans la requête correspond à `auth.uid()`
3. Vérifie que RLS est activé et que les policies existent

### Problème 4 : Les colonnes ne correspondent pas

**Cause** : Tu as modifié le code mais pas la base de données (ou vice versa)

**Solution** :
1. Compare `CloudMemory` interface avec le schéma SQL
2. Ajoute les colonnes manquantes avec `ALTER TABLE`
3. Mets à jour le code TypeScript si nécessaire

---

## Workflow recommandé pour les mises à jour

### Quand tu exportes depuis Bolt

1. **Exporte le projet depuis Bolt**
2. **Vérifie les modifications** dans les fichiers :
   - `utils/memoriesStorage.ts`
   - `utils/cloudStorage.ts`
   - Tout fichier qui utilise Supabase
3. **Compare avec ta base de données actuelle** :
   - Va sur Supabase Dashboard → Table Editor
   - Vérifie que les colonnes correspondent
4. **Crée une migration si nécessaire** :
   - Si de nouvelles colonnes sont ajoutées dans le code
   - Si de nouvelles tables sont nécessaires
5. **Teste localement** avec Expo Go
6. **Build et déploie**

### Quand tu modifies directement Supabase

1. **Fais les modifications dans Supabase Dashboard**
2. **Exporte le schéma** (voir section ci-dessus)
3. **Mets à jour les interfaces TypeScript** dans ton code :
   - `utils/memoriesStorage.ts`
   - `utils/cloudStorage.ts`
4. **Teste que tout fonctionne**
5. **Commit les changements**

---

## Commandes utiles

### Vérifier la connexion Supabase

Dans ton app, ajoute ce code temporaire :

```typescript
// Dans n'importe quel écran
import { supabase } from '@/utils/supabase';

const testConnection = async () => {
  // Test connexion
  const { data: { user } } = await supabase.auth.getUser();
  console.log('User:', user);

  // Test requête
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .limit(1);

  console.log('Test query:', { data, error });
};

testConnection();
```

### Vérifier le bucket storage

```typescript
import { supabase } from '@/utils/supabase';

const testStorage = async () => {
  const { data, error } = await supabase.storage
    .from('memories')
    .list();

  console.log('Storage test:', { data, error });
};

testStorage();
```

---

## Résumé

### État actuel : ✅ TOUT EST SYNCHRONISÉ

Ta base de données Supabase est **parfaitement synchronisée** avec ton code exporté depuis Bolt :

- ✅ Table `memories` créée avec toutes les colonnes
- ✅ RLS activé et policies configurées
- ✅ Bucket storage `memories` créé
- ✅ Interfaces TypeScript correspondent au schéma
- ✅ Migration appliquée

### Tu n'as rien à faire pour l'instant !

Ton projet est prêt à être utilisé. Tu peux :
1. Continuer le développement
2. Tester l'app avec Expo Go
3. Préparer la publication sur les stores

### Si tu fais des modifications plus tard

Utilise ce guide pour :
- Vérifier que le code et la base de données restent synchronisés
- Créer de nouvelles migrations si nécessaire
- Exporter le schéma pour référence
- Résoudre les problèmes de synchronisation

---

## Support

### Ressources

- **Supabase Dashboard** : https://app.supabase.com/project/wwuxaoggbvgmyzcjlgfx
- **Supabase Docs** : https://supabase.com/docs
- **Supabase CLI** : https://supabase.com/docs/guides/cli

### Aide

Si tu rencontres des problèmes :
1. Vérifie les logs dans Supabase Dashboard → Logs
2. Vérifie la console Metro pour les erreurs
3. Utilise les commandes de test ci-dessus pour diagnostiquer
