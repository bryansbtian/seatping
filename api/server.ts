import type { VercelRequest, VercelResponse } from "@vercel/node";

let app: any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!app) {
    const module = await import("../dist-server/index.js");
    app = module.default;
  }

  return app(req, res);
}
