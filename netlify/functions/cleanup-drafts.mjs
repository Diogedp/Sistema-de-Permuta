import { getStore } from "@netlify/blobs";

const STORE_NAME = "permuta-drafts";
const FALLBACK_TTL_DAYS = 90;
const MAX_DELETIONS_PER_RUN = 500;

export default async () => {
  const store = getStore(STORE_NAME);
  const now = Date.now();
  const fallbackTtlMs = FALLBACK_TTL_DAYS * 24 * 60 * 60 * 1000;
  const result = {
    scanned: 0,
    deleted: 0,
    kept: 0,
    errors: [],
  };

  const { blobs } = await store.list();

  for (const { key } of blobs) {
    result.scanned += 1;

    if (result.deleted >= MAX_DELETIONS_PER_RUN) {
      result.kept += 1;
      continue;
    }

    try {
      const draft = await store.get(key, { type: "json" });

      if (!draft || shouldDeleteDraft(draft, now, fallbackTtlMs)) {
        await store.delete(key);
        result.deleted += 1;
      } else {
        result.kept += 1;
      }
    } catch (err) {
      await store.delete(key);
      result.deleted += 1;
      result.errors.push({ key, error: err.message });
    }
  }

  return Response.json(result, {
    headers: {
      "cache-control": "no-store",
    },
  });
};

export const config = {
  schedule: "@weekly",
};

function shouldDeleteDraft(draft, now, fallbackTtlMs) {
  const expiresAt = Date.parse(draft.expira_em || "");
  if (Number.isFinite(expiresAt)) return expiresAt <= now;

  const createdAt = Date.parse(draft.criado_em || draft.salvo_em || "");
  if (!Number.isFinite(createdAt)) return true;

  return createdAt + fallbackTtlMs <= now;
}
