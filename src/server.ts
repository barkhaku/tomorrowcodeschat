import { app } from './app';
import { config } from './config';
import { migrate } from './migrate';

async function main(): Promise<void> {
  await migrate();
  app.listen(config.port, () => console.log(`Chat backend listening on :${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
