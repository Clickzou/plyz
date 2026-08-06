import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import WelcomeAuthScreen from '@/components/WelcomeAuthScreen';
import { supabase } from '@/utils/supabase';

// Profil « complet » = identité de facturation présente (prénom + nom + adresse).
// Nécessaire avant tout paiement pour établir une facture nominative.
async function isBillingProfileComplete(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, address')
      .eq('id', userId)
      .maybeSingle();
    return !!(
      (data?.first_name || '').trim() &&
      (data?.last_name || '').trim() &&
      (data?.address || '').trim()
    );
  } catch {
    // En cas d'erreur réseau, on ne bloque pas l'utilisateur.
    return true;
  }
}

// Profil PUBLIC = pseudo + photo. C'est ce que voit la personnalité quand un fan
// lui demande un appel ou rejoint son événement. « Utilisateur », sans visage, ne
// lui dit rien : elle ne peut ni reconnaître son fan, ni décider de répondre.
async function isPublicProfileComplete(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    return !!((data?.display_name || '').trim() && (data?.avatar_url || '').trim());
  } catch {
    // En cas d'erreur réseau, on ne bloque pas l'utilisateur.
    return true;
  }
}

interface RequireAuthOptions {
  /** Petit texte d'accroche affiché en haut du modal de connexion. */
  reason?: string;
  /**
   * Exiger l'identité de facturation (prénom + nom + adresse) avant de continuer.
   * Par défaut true. Mettre à false pour les actions qui n'émettent PAS de facture
   * au nom de l'utilisateur (organiser un événement, liker, suivre, partager…) :
   * seul un compte est alors requis. Pour une célébrité, l'identité légale de ses
   * factures est récupérée depuis Stripe, pas ressaisie.
   */
  requireBillingIdentity?: boolean;
  /**
   * Affiche un bloc INCITATIF « célébrité » (85% de revenus, gains, fans heureux)
   * sur l'écran de création de compte. À activer quand l'action est de devenir
   * célébrité / créer un événement, pour motiver l'inscription. Sans mention d'Apple.
   */
  celebrityPitch?: boolean;
  /**
   * Exiger le profil public (pseudo + photo) avant de continuer. Par défaut true.
   * Mettre à false pour les gestes qui n'exposent l'utilisateur à personne
   * (aimer, partager) : leur imposer une photo n'aurait aucun sens.
   *
   * Cette exigence était jusqu'ici INAPPLIQUÉE dès lors que l'utilisateur était
   * déjà connecté : on entrait directement dans l'action sans jamais regarder le
   * pseudo. D'où des demandes d'appel vidéo signées « Utilisateur ».
   */
  requirePublicProfile?: boolean;
}

interface AuthPromptContextType {
  /**
   * Exige un compte avant d'exécuter `onSuccess`.
   * - Si un utilisateur est déjà connecté -> exécute `onSuccess()` immédiatement.
   * - Sinon -> mémorise le callback et ouvre le modal de connexion global. Le
   *   callback est exécuté automatiquement dès que la connexion + le profil sont
   *   terminés, puis le modal se ferme.
   */
  requireAuth: (onSuccess: () => void, options?: RequireAuthOptions) => void;
  /** Vrai tant que le modal de connexion global est ouvert. */
  isAuthModalOpen: boolean;
}

const AuthPromptContext = createContext<AuthPromptContextType | undefined>(undefined);

export const AuthPromptProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [billingRequired, setBillingRequired] = useState(true);
  const [publicRequired, setPublicRequired] = useState(true);
  const [celebrityPitch, setCelebrityPitch] = useState(false);

  // Le callback en attente est conservé dans une ref pour éviter des re-renders
  // inutiles et garantir qu'on exécute toujours la dernière version demandée.
  const pendingCallbackRef = useRef<(() => void) | null>(null);

  const runPendingCallback = useCallback(() => {
    const cb = pendingCallbackRef.current;
    pendingCallbackRef.current = null;
    if (cb) cb();
  }, []);

  const requireAuth = useCallback(
    async (onSuccess: () => void, options?: RequireAuthOptions) => {
      const needBilling = options?.requireBillingIdentity !== false;
      const needPublic = options?.requirePublicProfile !== false;
      // Déjà connecté : on exécute tout de suite si RIEN ne manque. Le profil
      // public est contrôlé ici au même titre que l'identité de facturation —
      // il ne l'était pas, et un compte créé sans passer par l'étape « pseudo »
      // restait « Utilisateur » pour toujours, sans jamais qu'on le lui demande.
      if (user) {
        const okBilling = !needBilling || (await isBillingProfileComplete(user.id));
        const okPublic = !needPublic || (await isPublicProfileComplete(user.id));
        if (okBilling && okPublic) {
          onSuccess();
          return;
        }
        // Connecté mais profil incomplet : on ouvre le modal, qui ira droit à
        // l'étape manquante (« Tes informations » ou pseudo + photo).
      }
      // Pas connecté (ou profil requis incomplet) : on mémorise et on ouvre le modal.
      pendingCallbackRef.current = onSuccess;
      setReason(options?.reason);
      setBillingRequired(needBilling);
      setPublicRequired(needPublic);
      setCelebrityPitch(options?.celebrityPitch === true);
      setIsAuthModalOpen(true);
    },
    [user]
  );

  const handleAuthenticated = useCallback(() => {
    // Connexion + profil terminés : on ferme le modal puis on exécute l'action.
    setIsAuthModalOpen(false);
    setReason(undefined);
    runPendingCallback();
  }, [runPendingCallback]);

  const handleClose = useCallback(() => {
    // Fermeture manuelle (croix) : on annule l'action en attente.
    pendingCallbackRef.current = null;
    setIsAuthModalOpen(false);
    setReason(undefined);
  }, []);

  return (
    <AuthPromptContext.Provider value={{ requireAuth, isAuthModalOpen }}>
      {children}
      {isAuthModalOpen && (
        <WelcomeAuthScreen
          asModal
          reason={reason}
          requireBillingIdentity={billingRequired}
          requirePublicProfile={publicRequired}
          celebrityPitch={celebrityPitch}
          onAuthenticated={handleAuthenticated}
          onClose={handleClose}
        />
      )}
    </AuthPromptContext.Provider>
  );
};

export const useAuthPrompt = () => {
  const context = useContext(AuthPromptContext);
  if (context === undefined) {
    throw new Error('useAuthPrompt must be used within an AuthPromptProvider');
  }
  return context;
};
