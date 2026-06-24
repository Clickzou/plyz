import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import WelcomeAuthScreen from '@/components/WelcomeAuthScreen';

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
    (onSuccess: () => void, options?: RequireAuthOptions) => {
      // Déjà connecté : on exécute tout de suite.
      if (user) {
        onSuccess();
        return;
      }
      // Pas connecté : on mémorise et on ouvre le modal.
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
