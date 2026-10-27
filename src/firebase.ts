import { readFileSync } from 'fs';
import { cert, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from './config';

if (config.firebaseServiceAccountPath) {
  const account = JSON.parse(readFileSync(config.firebaseServiceAccountPath, 'utf8')) as ServiceAccount;
  initializeApp({ credential: cert(account) });
} else {
  // Works with the Firestore emulator (FIRESTORE_EMULATOR_HOST) or ADC.
  initializeApp({ projectId: config.firebaseProjectId ?? 'demo-chat' });
}

export const firestore = getFirestore();
