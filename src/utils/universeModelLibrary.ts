import type { UniverseModelV1 } from "@/types/universeModel";

export const MODEL_LIBRARY_KEY = "gua.universeModelLibrary.v1";

export type UniverseModelLibraryItemV1 = {
  id: string;
  name: string;
  model: UniverseModelV1;
  createdAt: number;
  updatedAt: number;
};

export type UniverseModelLibraryV1 = {
  v: 1;
  activeId: string;
  items: UniverseModelLibraryItemV1[];
};

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function makeLibraryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `M${Date.now().toString(16)}${Math.floor(Math.random() * 1e9).toString(16)}`;
}

export function loadUniverseModelLibrary(): UniverseModelLibraryV1 | null {
  const parsed = safeJsonParse<UniverseModelLibraryV1>(localStorage.getItem(MODEL_LIBRARY_KEY));
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.items) || typeof parsed.activeId !== "string") return null;
  const items = parsed.items
    .filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && (x as { model?: UniverseModelV1 }).model)
    .map((x) => ({
      ...x,
      createdAt: Number.isFinite(x.createdAt) ? x.createdAt : Date.now(),
      updatedAt: Number.isFinite(x.updatedAt) ? x.updatedAt : Date.now(),
    }));
  if (items.length === 0) return null;
  const activeId = items.some((x) => x.id === parsed.activeId) ? parsed.activeId : items[0]!.id;
  return { v: 1, activeId, items };
}

export function saveUniverseModelLibrary(next: UniverseModelLibraryV1) {
  try {
    localStorage.setItem(MODEL_LIBRARY_KEY, JSON.stringify(next));
  } catch {
    void 0;
  }
}

export function ensureUniverseModelLibrary(args: {
  legacyModel: UniverseModelV1 | null;
  initModel: () => UniverseModelV1;
}): UniverseModelLibraryV1 {
  const existing = loadUniverseModelLibrary();
  if (existing) return existing;
  const now = Date.now();
  const baseModel = args.legacyModel ?? args.initModel();
  const id = makeLibraryId();
  const lib: UniverseModelLibraryV1 = {
    v: 1,
    activeId: id,
    items: [{ id, name: "默认模型", model: baseModel, createdAt: now, updatedAt: now }],
  };
  saveUniverseModelLibrary(lib);
  return lib;
}

export function addUniverseModelItem(
  lib: UniverseModelLibraryV1,
  item: UniverseModelLibraryItemV1,
  makeActive: boolean,
): UniverseModelLibraryV1 {
  const items = [item, ...lib.items].slice(0, 60);
  return { ...lib, items, activeId: makeActive ? item.id : lib.activeId };
}

export function updateActiveModel(lib: UniverseModelLibraryV1, model: UniverseModelV1): UniverseModelLibraryV1 {
  const now = Date.now();
  return {
    ...lib,
    items: lib.items.map((x) => (x.id === lib.activeId ? { ...x, model, updatedAt: now } : x)),
  };
}

export function setActiveUniverseModel(lib: UniverseModelLibraryV1, id: string): UniverseModelLibraryV1 {
  if (!lib.items.some((x) => x.id === id)) return lib;
  return { ...lib, activeId: id };
}

export function renameUniverseModelItem(lib: UniverseModelLibraryV1, id: string, name: string): UniverseModelLibraryV1 {
  const now = Date.now();
  return { ...lib, items: lib.items.map((x) => (x.id === id ? { ...x, name, updatedAt: now } : x)) };
}

export function deleteUniverseModelItem(lib: UniverseModelLibraryV1, id: string): UniverseModelLibraryV1 {
  if (lib.items.length <= 1) return lib;
  const nextItems = lib.items.filter((x) => x.id !== id);
  if (nextItems.length === 0) return lib;
  const activeId = lib.activeId === id ? nextItems[0]!.id : lib.activeId;
  return { ...lib, activeId, items: nextItems };
}
