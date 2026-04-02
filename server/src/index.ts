import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import { OAuth2Client } from "google-auth-library";
import "dotenv/config";
import {
  Circuit,
  initializeStorage,
  ToolboxIC,
  User,
  Visibility,
  WorkspaceDraft,
} from "./storage";

const app = express();
const PORT = process.env.PORT || 4000;

// ==============================
// Google Sign-In configuration
// ==============================
// Put your Google OAuth "Web client" ID here via env.
// This MUST match the client_id used on the frontend.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const storage = initializeStorage();
const store = storage.state;

console.log(
  "Cirkit data mode:",
  storage.mode,
  "| bundled:",
  storage.bundledFilePath,
  storage.externalFilePath ? "| persistent: " + storage.externalFilePath : ""
);

function saveStore() {
  storage.save();
}

function toClientCircuit(circuit: Circuit) {
  return {
    id: circuit.id,
    ownerId: circuit.ownerId,
    title: circuit.title,
    visibility: circuit.visibility,
    data: circuit.data,
  };
}

function toClientCircuitSummary(circuit: Circuit) {
  return {
    id: circuit.id,
    ownerId: circuit.ownerId,
    title: circuit.title,
    visibility: circuit.visibility,
  };
}

function toClientToolboxEntry(entry: ToolboxIC) {
  return {
    id: entry.id,
    ownerId: entry.ownerId,
    name: entry.name,
    description: entry.description,
    data: entry.data,
    createdAt: entry.createdAt,
  };
}

function toClientWorkspaceDraft(draft: WorkspaceDraft) {
  return {
    title: draft.title,
    visibility: draft.visibility,
    data: draft.data,
    updatedAt: draft.updatedAt,
  };
}

// ---------- Middleware ----------

app.use(
  cors({
    origin: true, // reflect request origin
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(
    "[" + new Date().toISOString() + "] " + req.method + " " + req.path
  );
  next();
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userIdCookie = (req as any).cookies["userId"];
  if (!userIdCookie) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  const userId = Number(userIdCookie);
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }
  (req as any).user = user;
  next();
}

function setSessionCookie(res: Response, userId: number) {
  // NOTE:
  // - sameSite:"lax" works well for same-site usage (benchen.io across paths/ports).
  // - If you later host frontend on a different *site*, switch to sameSite:"none" + secure:true over HTTPS.
  res.cookie("userId", String(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/", // be explicit so it works for /cirkit and /api equally
  });
}

// ==============================
// API Router (mounted at /api and /cirkit/api)
// ==============================

const api = express.Router();

// ==============================
// Auth routes (Google Sign-In)
// ==============================

api.post("/auth/google", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const credential: string | undefined = body.credential;

    if (!GOOGLE_CLIENT_ID) {
      res.status(500).json({ error: "Server missing GOOGLE_CLIENT_ID" });
      return;
    }
    if (!credential) {
      res.status(400).json({ error: "Missing credential" });
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

    const sub = payload.sub;
    const email = payload.email || "";
    const name = payload.name || payload.given_name || "User";
    const picture = payload.picture;

    if (!sub || !email) {
      res.status(401).json({ error: "Google token missing identity" });
      return;
    }

    let didChangeUserStore = false;
    let user = store.users.find((u) => u.googleSub === sub);
    if (!user) {
      // If user exists by email (rare edge case), attach sub.
      const byEmail = store.users.find((u) => u.email === email);
      if (byEmail) {
        byEmail.googleSub = sub;
        byEmail.name = name;
        byEmail.picture = picture;
        user = byEmail;
        didChangeUserStore = true;
      } else {
        user = {
          id: store.nextUserId++,
          googleSub: sub,
          email,
          name,
          picture,
        };
        store.users.push(user);
        didChangeUserStore = true;
      }
    } else {
      // Keep info fresh
      const pictureChanged = user.picture !== picture;
      const emailChanged = user.email !== email;
      const nameChanged = user.name !== name;
      user.email = email;
      user.name = name;
      user.picture = picture;
      didChangeUserStore = pictureChanged || emailChanged || nameChanged;
    }

    if (didChangeUserStore) {
      saveStore();
    }

    setSessionCookie(res, user.id);

    res.json({
      id: user.id,
      username: user.email, // keep your frontend fields compatible
      nickname: user.name,
      email: user.email,
      picture: user.picture,
    });
  } catch (err) {
    console.error("Google auth error:", err);
    const detail =
      err instanceof Error && err.message.trim()
        ? `Google auth failed: ${err.message.trim()}`
        : "Google auth failed";
    res.status(401).json({ error: detail });
  }
});

api.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("userId", { path: "/" });
  res.json({ ok: true });
});

api.get("/me", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  res.json({
    id: user.id,
    username: user.email,
    nickname: user.name,
    email: user.email,
    picture: user.picture,
  });
});

// ---------- Circuit routes ----------

api.post("/circuits", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const body = req.body || {};
  const id = body.id;
  const title: string | undefined = body.title;
  const visibility: string | undefined = body.visibility;
  const data = body.data;

  if (!title || !visibility || typeof data === "undefined") {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  if (visibility !== "private" && visibility !== "preview" && visibility !== "open") {
    res.status(400).json({ error: "invalid visibility" });
    return;
  }

  let circuit: Circuit | undefined;

  if (typeof id !== "undefined" && id !== null) {
    const numericId = Number(id);
    circuit = store.circuits.find((c) => c.id === numericId && c.ownerId === user.id);
    if (!circuit) {
      res.status(404).json({ error: "circuit not found" });
      return;
    }
    circuit.title = title;
    circuit.visibility = visibility as Visibility;
    circuit.data = data;
  } else {
    circuit = {
      id: store.nextCircuitId++,
      key: "circuit-" + randomUUID(),
      ownerId: user.id,
      ownerGoogleSub: user.googleSub,
      title,
      visibility: visibility as Visibility,
      data,
    };
    store.circuits.push(circuit);
  }

  saveStore();
  res.json(toClientCircuit(circuit));
});

api.get("/my-circuits", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const mine = store.circuits
    .filter((c) => c.ownerId === user.id)
    .map(toClientCircuit);
  res.json(mine);
});

// Community list
api.get("/community", (_req: Request, res: Response) => {
  const visible = store.circuits.filter(
    (c) => c.visibility === "preview" || c.visibility === "open"
  );
  const payload = visible.map(toClientCircuitSummary);
  res.json(payload);
});

// Get single circuit
api.get("/circuits/:id", (req: Request, res: Response) => {
  const circuitId = Number(req.params.id);
  const circuit = store.circuits.find((c) => c.id === circuitId);
  if (!circuit) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const userIdCookie = (req as any).cookies["userId"];
  const isOwner = userIdCookie && Number(userIdCookie) === circuit.ownerId;

  if (!isOwner && circuit.visibility !== "preview" && circuit.visibility !== "open") {
    res.status(403).json({ error: "not allowed" });
    return;
  }

  res.json(toClientCircuit(circuit));
});

// ---------- Workspace draft routes ----------

api.get("/workspace-draft", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const draft = store.workspaceDrafts.find((item) => item.ownerId === user.id);
  if (!draft) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(toClientWorkspaceDraft(draft));
});

api.put("/workspace-draft", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const body = req.body || {};
  const title: string | undefined = body.title;
  const visibility: string | undefined = body.visibility;
  const data = body.data;

  if (!title || !visibility || typeof data === "undefined") {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  if (visibility !== "private" && visibility !== "preview" && visibility !== "open") {
    res.status(400).json({ error: "invalid visibility" });
    return;
  }

  let draft = store.workspaceDrafts.find((item) => item.ownerId === user.id);
  if (!draft) {
    draft = {
      key: "draft-" + user.googleSub,
      ownerId: user.id,
      ownerGoogleSub: user.googleSub,
      title,
      visibility: visibility as Visibility,
      data,
      updatedAt: Date.now(),
    };
    store.workspaceDrafts.push(draft);
  } else {
    draft.title = title;
    draft.visibility = visibility as Visibility;
    draft.data = data;
    draft.updatedAt = Date.now();
    draft.ownerGoogleSub = user.googleSub;
  }

  saveStore();
  res.json(toClientWorkspaceDraft(draft));
});

api.delete("/workspace-draft", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const index = store.workspaceDrafts.findIndex((item) => item.ownerId === user.id);
  if (index >= 0) {
    store.workspaceDrafts.splice(index, 1);
    saveStore();
  }
  res.json({ ok: true });
});

// ---------- IC Toolbox routes ----------

api.get("/toolbox", (_req: Request, res: Response) => {
  const list = store.toolboxICs.map((ic) => ({
    id: ic.id,
    name: ic.name,
    ownerId: ic.ownerId,
    createdAt: ic.createdAt,
  }));
  res.json(list);
});

api.get("/toolbox/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ic = store.toolboxICs.find((t) => t.id === id);
  if (!ic) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(toClientToolboxEntry(ic));
});

api.post("/toolbox", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const body = req.body || {};
  const name: string | undefined = body.name;
  const description: string | undefined = body.description;
  const data = body.data;

  if (!name || typeof data === "undefined") {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  const entry: ToolboxIC = {
    id: store.nextToolboxId++,
    key: "toolbox-" + randomUUID(),
    ownerId: user.id,
    ownerGoogleSub: user.googleSub,
    name,
    description,
    data,
    createdAt: Date.now(),
  };
  store.toolboxICs.push(entry);
  saveStore();
  res.json(toClientToolboxEntry(entry));
});

// Mount the same API under both prefixes:
// - /api/*       (local dev + old behavior)
// - /cirkit/api/* (your tunnel deployment under /cirkit)
app.use("/api", api);
app.use("/cirkit/api", api);

// ---------- Start server ----------

app.listen(PORT, () => {
  console.log("Cirkit backend listening on http://localhost:" + PORT);
});
