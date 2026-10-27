import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
} as const;
