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

interface RequireAuthOptions {
  /** Petit texte d'accroche affiché en haut du modal de connexion. */
  reason?: string;
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
      // Déjà connecté ET profil de facturation complet : on exécute tout de suite.
      if (user) {
        const complete = await isBillingProfileComplete(user.id);
        if (complete) {
          onSuccess();
          return;
        }
        // Connecté mais profil incomplet : on ouvre le modal (il ira directement
        // à l'étape « Tes informations » pour collecter prénom/nom/adresse).
      }
      // Pas connecté (ou profil incomplet) : on mémorise et on ouvre le modal.
      pendingCallbackRef.current = onSuccess;
      setReason(options?.reason);
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
