import express from "express";
import { describe, expect, it } from "vitest";
import { closeTestServers, serveApp } from "../helpers/app.js";

describe("Local HTTP Test Servers", () => {
  it("binds to the same IPv4 loopback interface used by the client", async () => {
    const app = express();
    app.get("/", (req, res) => {
      res.json({ address: req.socket.localAddress });
    });
    const client = await serveApp(app);
    const response = await client.get("/");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ address: "127.0.0.1" });
  });

  it("keeps simultaneous requests isolated to their own application", async () => {
    const clients = await Promise.all(
      Array.from({ length: 20 }, async (_, id) => {
        const app = express();
        app.use(express.json());
        app.post("/", (req, res) => {
          res.status(401).json({ id, payload: req.body });
        });
        return serveApp(app);
      }),
    );
    const responses = await Promise.all(clients.map((client, id) => client.post("/").send({ id })));
    for (const [id, response] of responses.entries()) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ id, payload: { id } });
    }
  });

  it("closes all tracked listeners and allows cleanup to run again", async () => {
    const app = express();
    app.get("/", (_req, res) => res.sendStatus(200));
    const client = await serveApp(app);
    expect((await client.get("/")).status).toBe(200);
    await closeTestServers();
    await expect(client.get("/")).rejects.toThrow("ECONNREFUSED");
    await expect(closeTestServers()).resolves.toBeUndefined();
  });
});
