import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import the compiled Express app
let app: any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Lazy load the Express app
  if (!app) {
    const module = await import('../dist-server/index.js');
    app = module.default;
  }

  return app(req, res);
}
