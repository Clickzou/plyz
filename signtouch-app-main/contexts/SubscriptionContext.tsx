import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSubscriptionStatus, setSubscriptionStatus as saveSubscriptionStatus, SubscriptionStatus } from '@/utils/subscriptionStorage';

// SET TO true TO RE-ENABLE SUBSCRIPTION SYSTEM (paywall, trial, promo codes)
// When false, all features are free (except live sessions which use Stripe)
export const SUBSCRIPTION_ENABLED = false;

interface SubscriptionContextType {
  status: SubscriptionStatus;
  isPremium: boolean;
  setStatus: (status: SubscriptionStatus) => Promise<void>;
  loading: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatusState] = useState<SubscriptionStatus>(SUBSCRIPTION_ENABLED ? 'free' : 'paid');
  const [loading, setLoading] = useState(SUBSCRIPTION_ENABLED);

  useEffect(() => {
    if (SUBSCRIPTION_ENABLED) {
      loadStatus();
    }
  }, []);

  const loadStatus = async () => {
    try {
      const currentStatus = await getSubscriptionStatus();
      setStatusState(currentStatus);
    } catch (error) {
      console.error('Error loading subscription status:', error);
    } finally {
      setLoading(false);
    }
  };

  const setStatus = async (newStatus: SubscriptionStatus) => {
    try {
      await saveSubscriptionStatus(newStatus);
      setStatusState(newStatus);
    } catch (error) {
      console.error('Error setting subscription status:', error);
    }
  };

  const isPremium = SUBSCRIPTION_ENABLED ? (status === 'paid' || status === 'trial') : true;

  return (
    <SubscriptionContext.Provider value={{ status, isPremium, setStatus, loading }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};
