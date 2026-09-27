import { Hono } from "hono";
import { handle } from "hono/vercel";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".csv"];

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "wb-mini-app",
  });
});

app.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File)) {
    return c.json({ ok: false, error: "Файл не передан." }, 400);
  }

  const lowerName = file.name.toLowerCase();
  const allowed = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

  if (!allowed) {
    return c.json(
      { ok: false, error: "Поддерживаются только XLSX и CSV." },
      415,
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json(
      { ok: false, error: "Размер файла превышает 20 МБ." },
      413,
    );
  }

  return c.json({
    ok: true,
    file: {
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
    },
  });
});

export const GET = handle(app);
export const POST = handle(app);
