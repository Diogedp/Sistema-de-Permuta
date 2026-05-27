import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const STORE_NAME = "permuta-drafts";
const MAX_BODY_BYTES = 220_000;
const ID_BYTES = 8;
const DRAFT_TTL_DAYS = 90;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export default async (request) => {
  try {
    if (request.method === "POST") {
      return await saveDraft(request);
    }

    if (request.method === "GET") {
      return await loadDraft(request);
    }

    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro inesperado." }, 500);
  }
};

async function saveDraft(request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Rascunho muito grande." }, 413);
  }

  const payload = JSON.parse(body);
  if (!payload || typeof payload !== "object" || !payload.campos) {
    return jsonResponse({ error: "Rascunho invalido." }, 400);
  }

  const store = getStore(STORE_NAME);
  let id = createId();
  let attempts = 0;

  while (attempts < 5) {
    const { modified } = await store.setJSON(id, {
      ...payload,
      salvo_em: new Date().toISOString(),
      expira_em: new Date(Date.now() + DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    }, {
      onlyIfNew: true,
    });

    if (modified) {
      return jsonResponse({ id });
    }

    attempts += 1;
    id = createId();
  }

  return jsonResponse({ error: "Nao foi possivel criar um identificador unico." }, 500);
}

async function loadDraft(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";

  if (!/^[a-zA-Z0-9_-]{8,32}$/.test(id)) {
    return jsonResponse({ error: "Identificador invalido." }, 400);
  }

  const store = getStore(STORE_NAME);
  const payload = await store.get(id, { type: "json" });

  if (!payload) {
    return jsonResponse({ error: "Rascunho nao encontrado." }, 404);
  }

  if (payload.expira_em && Date.parse(payload.expira_em) < Date.now()) {
    await store.delete(id);
    return jsonResponse({ error: "Rascunho expirado." }, 404);
  }

  return jsonResponse(payload);
}

function createId() {
  return randomBytes(ID_BYTES).toString("base64url");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}
