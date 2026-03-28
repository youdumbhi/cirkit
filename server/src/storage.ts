import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";

export type Visibility = "private" | "preview" | "open";

export interface User {
  id: number;
  googleSub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface Circuit {
  id: number;
  key: string;
  ownerId: number;
  ownerGoogleSub?: string;
  title: string;
  visibility: Visibility;
  data: any;
}

export interface ToolboxIC {
  id: number;
  key: string;
  ownerId: number;
  ownerGoogleSub?: string;
  name: string;
  description?: string;
  data: any;
  createdAt: number;
}

interface StorageMetadata {
  schemaVersion: number;
  appliedBundledSnapshotHashes: string[];
}

export interface DataStore {
  nextUserId: number;
  nextCircuitId: number;
  nextToolboxId: number;
  users: User[];
  circuits: Circuit[];
  toolboxICs: ToolboxIC[];
  metadata: StorageMetadata;
}

export interface RuntimeStorage {
  bundledFilePath: string;
  externalFilePath: string | null;
  mode: "bundled" | "external";
  state: DataStore;
  save: () => void;
}

const STORAGE_SCHEMA_VERSION = 1;
const DEFAULT_STORAGE_FILENAME = "cirkit-data.json";

function emptyStore(): DataStore {
  return {
    nextUserId: 1,
    nextCircuitId: 1,
    nextToolboxId: 1,
    users: [],
    circuits: [],
    toolboxICs: [],
    metadata: {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      appliedBundledSnapshotHashes: [],
    },
  };
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    return fallback;
  }
  return numeric;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableDigest(value: unknown): string {
  return hashText(JSON.stringify(value));
}

function buildCircuitKey(candidate: any): string {
  if (typeof candidate?.key === "string" && candidate.key.trim()) {
    return candidate.key.trim();
  }

  return "circuit-" + stableDigest({
    id: candidate?.id ?? null,
    ownerId: candidate?.ownerId ?? null,
    ownerGoogleSub: candidate?.ownerGoogleSub ?? null,
    title: candidate?.title ?? "",
    visibility: candidate?.visibility ?? "private",
    data: candidate?.data ?? null,
  }).slice(0, 16);
}

function buildToolboxKey(candidate: any): string {
  if (typeof candidate?.key === "string" && candidate.key.trim()) {
    return candidate.key.trim();
  }

  return "toolbox-" + stableDigest({
    id: candidate?.id ?? null,
    ownerId: candidate?.ownerId ?? null,
    ownerGoogleSub: candidate?.ownerGoogleSub ?? null,
    name: candidate?.name ?? "",
    description: candidate?.description ?? "",
    createdAt: candidate?.createdAt ?? null,
    data: candidate?.data ?? null,
  }).slice(0, 16);
}

function normalizeVisibility(value: unknown): Visibility {
  if (value === "preview" || value === "open") {
    return value;
  }
  return "private";
}

function normalizeUser(candidate: any): User | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const googleSub =
    typeof candidate.googleSub === "string" ? candidate.googleSub.trim() : "";
  if (!googleSub) {
    return null;
  }

  const email = typeof candidate.email === "string" ? candidate.email : "";
  const name = typeof candidate.name === "string" && candidate.name.trim()
    ? candidate.name
    : email || "User";
  const picture =
    typeof candidate.picture === "string" && candidate.picture.trim()
      ? candidate.picture
      : undefined;

  return {
    id: toPositiveInteger(candidate.id, 1),
    googleSub,
    email,
    name,
    picture,
  };
}

function normalizeCircuit(candidate: any): Circuit | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    return null;
  }

  const ownerGoogleSub =
    typeof candidate.ownerGoogleSub === "string" && candidate.ownerGoogleSub.trim()
      ? candidate.ownerGoogleSub.trim()
      : undefined;

  return {
    id: toPositiveInteger(candidate.id, 1),
    key: buildCircuitKey(candidate),
    ownerId: toPositiveInteger(candidate.ownerId, 1),
    ownerGoogleSub,
    title: candidate.title,
    visibility: normalizeVisibility(candidate.visibility),
    data: candidate.data,
  };
}

function normalizeToolboxEntry(candidate: any): ToolboxIC | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  if (typeof candidate.name !== "string" || !candidate.name.trim()) {
    return null;
  }

  const ownerGoogleSub =
    typeof candidate.ownerGoogleSub === "string" && candidate.ownerGoogleSub.trim()
      ? candidate.ownerGoogleSub.trim()
      : undefined;

  return {
    id: toPositiveInteger(candidate.id, 1),
    key: buildToolboxKey(candidate),
    ownerId: toPositiveInteger(candidate.ownerId, 1),
    ownerGoogleSub,
    name: candidate.name,
    description:
      typeof candidate.description === "string" && candidate.description.trim()
        ? candidate.description
        : undefined,
    data: candidate.data,
    createdAt: Number.isFinite(Number(candidate.createdAt))
      ? Number(candidate.createdAt)
      : Date.now(),
  };
}

function nextIdFrom(values: number[], fallback: number): number {
  if (!values.length) {
    return fallback;
  }
  return Math.max(...values, fallback - 1) + 1;
}

function normalizeStore(raw: unknown): DataStore {
  if (!raw || typeof raw !== "object") {
    return emptyStore();
  }

  const candidate = raw as Record<string, unknown>;
  const users = Array.isArray(candidate.users)
    ? candidate.users.map(normalizeUser).filter((item): item is User => item !== null)
    : [];

  const usersById = new Map<number, User>();
  for (const user of users) {
    if (!usersById.has(user.id)) {
      usersById.set(user.id, user);
    }
  }

  const circuits = Array.isArray(candidate.circuits)
    ? candidate.circuits
        .map(normalizeCircuit)
        .filter((item): item is Circuit => item !== null)
        .map((circuit) => ({
          ...circuit,
          ownerGoogleSub:
            circuit.ownerGoogleSub || usersById.get(circuit.ownerId)?.googleSub,
        }))
    : [];

  const toolboxICs = Array.isArray(candidate.toolboxICs)
    ? candidate.toolboxICs
        .map(normalizeToolboxEntry)
        .filter((item): item is ToolboxIC => item !== null)
        .map((entry) => ({
          ...entry,
          ownerGoogleSub:
            entry.ownerGoogleSub || usersById.get(entry.ownerId)?.googleSub,
        }))
    : [];

  const metadataCandidate =
    candidate.metadata && typeof candidate.metadata === "object"
      ? (candidate.metadata as Record<string, unknown>)
      : {};

  const metadata: StorageMetadata = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    appliedBundledSnapshotHashes: Array.isArray(
      metadataCandidate.appliedBundledSnapshotHashes
    )
      ? metadataCandidate.appliedBundledSnapshotHashes
          .filter((item): item is string => typeof item === "string" && !!item.trim())
          .map((item) => item.trim())
      : [],
  };

  return {
    nextUserId: Math.max(
      toPositiveInteger(candidate.nextUserId, 1),
      nextIdFrom(users.map((user) => user.id), 1)
    ),
    nextCircuitId: Math.max(
      toPositiveInteger(candidate.nextCircuitId, 1),
      nextIdFrom(circuits.map((circuit) => circuit.id), 1)
    ),
    nextToolboxId: Math.max(
      toPositiveInteger(candidate.nextToolboxId, 1),
      nextIdFrom(toolboxICs.map((entry) => entry.id), 1)
    ),
    users,
    circuits,
    toolboxICs,
    metadata,
  };
}

function readStore(filePath: string): { rawText: string | null; store: DataStore } {
  if (!existsSync(filePath)) {
    return { rawText: null, store: emptyStore() };
  }

  const rawText = readFileSync(filePath, "utf8");
  try {
    return { rawText, store: normalizeStore(JSON.parse(rawText)) };
  } catch (error) {
    console.error("Storage parse error:", error);
    throw new Error(
      "Failed to parse store at " + filePath + ". Refusing to continue so data is not overwritten."
    );
  }
}

function writeStore(filePath: string, store: DataStore) {
  mkdirSync(dirname(filePath), { recursive: true });
  const normalized = normalizeStore(store);
  const tempPath = filePath + "." + randomUUID() + ".tmp";
  writeFileSync(tempPath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  renameSync(tempPath, filePath);
}

function resolveBundledFilePath(): string {
  if (process.env.CIRKIT_BUNDLED_DATA_FILE) {
    return resolve(process.env.CIRKIT_BUNDLED_DATA_FILE);
  }
  return resolve(__dirname, "..", "data", DEFAULT_STORAGE_FILENAME);
}

function resolveAutomaticExternalFilePath(): string | null {
  if (process.platform !== "linux") {
    return null;
  }

  const projectRoot = resolve(__dirname, "..", "..");
  const siteRoot = dirname(projectRoot);
  const sitesRoot = dirname(siteRoot);

  if (siteRoot === projectRoot || sitesRoot === siteRoot) {
    return null;
  }

  const siteFolderName =
    process.env.CIRKIT_SITE_KEY || basename(siteRoot);

  if (!siteFolderName || siteFolderName === "storage") {
    return null;
  }

  return resolve(
    sitesRoot,
    "storage",
    siteFolderName,
    DEFAULT_STORAGE_FILENAME
  );
}

function resolveExternalFilePath(): string | null {
  if (process.env.CIRKIT_STORAGE_FILE) {
    return resolve(process.env.CIRKIT_STORAGE_FILE);
  }

  if (process.env.CIRKIT_STORAGE_DIR) {
    return resolve(process.env.CIRKIT_STORAGE_DIR, DEFAULT_STORAGE_FILENAME);
  }

  return resolveAutomaticExternalFilePath();
}

function claimNumericId(preferredId: number, nextId: number, usedIds: Set<number>) {
  if (preferredId > 0 && !usedIds.has(preferredId)) {
    usedIds.add(preferredId);
    return preferredId;
  }

  let candidate = nextId;
  while (usedIds.has(candidate)) {
    candidate += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function mergeUsers(target: DataStore, source: DataStore) {
  const usersBySub = new Map(target.users.map((user) => [user.googleSub, user]));

  for (const sourceUser of source.users) {
    const existing = usersBySub.get(sourceUser.googleSub);
    if (existing) {
      existing.email = sourceUser.email;
      existing.name = sourceUser.name;
      existing.picture = sourceUser.picture;
      continue;
    }

    const user: User = {
      id: target.nextUserId++,
      googleSub: sourceUser.googleSub,
      email: sourceUser.email,
      name: sourceUser.name,
      picture: sourceUser.picture,
    };
    target.users.push(user);
    usersBySub.set(user.googleSub, user);
  }
}

function findUserBySourceOwner(target: DataStore, source: DataStore, ownerGoogleSub?: string, ownerId?: number) {
  const resolvedGoogleSub =
    ownerGoogleSub ||
    source.users.find((user) => user.id === ownerId)?.googleSub;

  if (!resolvedGoogleSub) {
    return undefined;
  }

  return target.users.find((user) => user.googleSub === resolvedGoogleSub);
}

function mergeCircuits(target: DataStore, source: DataStore) {
  const circuitsByKey = new Map(target.circuits.map((circuit) => [circuit.key, circuit]));
  const usedIds = new Set(target.circuits.map((circuit) => circuit.id));

  for (const sourceCircuit of source.circuits) {
    const owner = findUserBySourceOwner(
      target,
      source,
      sourceCircuit.ownerGoogleSub,
      sourceCircuit.ownerId
    );
    if (!owner) {
      console.warn("Skipping circuit import with unresolved owner:", sourceCircuit.title);
      continue;
    }

    const existing = circuitsByKey.get(sourceCircuit.key);
    if (existing) {
      existing.ownerId = owner.id;
      existing.ownerGoogleSub = owner.googleSub;
      existing.title = sourceCircuit.title;
      existing.visibility = sourceCircuit.visibility;
      existing.data = sourceCircuit.data;
      continue;
    }

    const preferredId = toPositiveInteger(sourceCircuit.id, target.nextCircuitId);
    const id = claimNumericId(preferredId, target.nextCircuitId, usedIds);
    target.nextCircuitId = Math.max(target.nextCircuitId, id + 1);

    const circuit: Circuit = {
      id,
      key: sourceCircuit.key,
      ownerId: owner.id,
      ownerGoogleSub: owner.googleSub,
      title: sourceCircuit.title,
      visibility: sourceCircuit.visibility,
      data: sourceCircuit.data,
    };
    target.circuits.push(circuit);
    circuitsByKey.set(circuit.key, circuit);
  }
}

function mergeToolboxEntries(target: DataStore, source: DataStore) {
  const toolboxByKey = new Map(target.toolboxICs.map((entry) => [entry.key, entry]));
  const usedIds = new Set(target.toolboxICs.map((entry) => entry.id));

  for (const sourceEntry of source.toolboxICs) {
    const owner = findUserBySourceOwner(
      target,
      source,
      sourceEntry.ownerGoogleSub,
      sourceEntry.ownerId
    );
    if (!owner) {
      console.warn("Skipping toolbox import with unresolved owner:", sourceEntry.name);
      continue;
    }

    const existing = toolboxByKey.get(sourceEntry.key);
    if (existing) {
      existing.ownerId = owner.id;
      existing.ownerGoogleSub = owner.googleSub;
      existing.name = sourceEntry.name;
      existing.description = sourceEntry.description;
      existing.data = sourceEntry.data;
      existing.createdAt = sourceEntry.createdAt;
      continue;
    }

    const preferredId = toPositiveInteger(sourceEntry.id, target.nextToolboxId);
    const id = claimNumericId(preferredId, target.nextToolboxId, usedIds);
    target.nextToolboxId = Math.max(target.nextToolboxId, id + 1);

    const entry: ToolboxIC = {
      id,
      key: sourceEntry.key,
      ownerId: owner.id,
      ownerGoogleSub: owner.googleSub,
      name: sourceEntry.name,
      description: sourceEntry.description,
      data: sourceEntry.data,
      createdAt: sourceEntry.createdAt,
    };
    target.toolboxICs.push(entry);
    toolboxByKey.set(entry.key, entry);
  }
}

function mergeBundledStoreIntoPersistent(target: DataStore, source: DataStore) {
  mergeUsers(target, source);
  mergeCircuits(target, source);
  mergeToolboxEntries(target, source);
}

export function initializeStorage(): RuntimeStorage {
  const bundledFilePath = resolveBundledFilePath();
  const externalFilePath = resolveExternalFilePath();

  if (!externalFilePath) {
    const { store } = readStore(bundledFilePath);
    writeStore(bundledFilePath, store);
    return {
      bundledFilePath,
      externalFilePath: null,
      mode: "bundled",
      state: store,
      save: () => writeStore(bundledFilePath, store),
    };
  }

  const bundled = readStore(bundledFilePath);
  const persistent = readStore(externalFilePath);
  const bundledHash = bundled.rawText !== null ? hashText(bundled.rawText) : null;

  if (
    bundledHash &&
    !persistent.store.metadata.appliedBundledSnapshotHashes.includes(bundledHash)
  ) {
    mergeBundledStoreIntoPersistent(persistent.store, bundled.store);
    persistent.store.metadata.appliedBundledSnapshotHashes.push(bundledHash);
  }

  writeStore(externalFilePath, persistent.store);

  return {
    bundledFilePath,
    externalFilePath,
    mode: "external",
    state: persistent.store,
    save: () => writeStore(externalFilePath, persistent.store),
  };
}
