import express, { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './errors';
import { router } from './routes';

export const app = express();
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => { res.json({ status: 'ok' }); });
app.use(router);

app.use((_req: Request, res: Response) => { res.status(404).json({ error: 'Route not found' }); });

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.issues });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
