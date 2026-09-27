import { Hono } from "hono";
import { handle } from "hono/vercel";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".csv"];

type Row = Record<string, unknown>;

const aliases = {
  article: ["Артикул", "Артикул продавца", "nm_id", "Артикул WB"],
  name: ["Наименование", "Товар", "Предмет"],
  sales: ["Продажи, ₽", "Продажи", "Выручка, ₽", "Выручка"],
  returns: ["Возвраты, ₽", "Возвраты"],
  commission: ["Комиссия WB, ₽", "Комиссия WB", "Комиссия, ₽", "Комиссия"],
  logistics: ["Логистика, ₽", "Логистика"],
  storage: ["Хранение, ₽", "Хранение"],
  deductions: ["Удержания, ₽", "Удержания", "Прочие удержания, ₽"],
  cost: ["Себестоимость, ₽", "Себестоимость"],
  profit: ["Прибыль, ₽", "Прибыль"],
} as const;

function pick(row: Row, names: readonly string[]) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }
  return undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;

  const normalized = value
    .replace(/\s/g, "")
    .replace(/₽/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.\-]/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

app.get("/health", (c) => {
  return c.json({ ok: true, service: "wb-mini-app" });
});

app.post("/upload", async (c) => {
  try {
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

    const sheetName = workbook.SheetNames.find((name) => name !== "README")
      ?? workbook.SheetNames[0];

    if (!sheetName) {
      return c.json({ ok: false, error: "В файле нет листов." }, 422);
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Row>(worksheet, {
      defval: null,
      raw: true,
    });

    if (rawRows.length === 0) {
      return c.json({ ok: false, error: "В отчёте нет строк с данными." }, 422);
    }

    const products = rawRows
      .map((row, index) => {
        const sales = toNumber(pick(row, aliases.sales));
        const returns = toNumber(pick(row, aliases.returns));
        const commission = toNumber(pick(row, aliases.commission));
        const logistics = toNumber(pick(row, aliases.logistics));
        const storage = toNumber(pick(row, aliases.storage));
        const deductions = toNumber(pick(row, aliases.deductions));
        const cost = toNumber(pick(row, aliases.cost));

        const importedProfit = pick(row, aliases.profit);
        const calculatedProfit =
          sales - returns - commission - logistics - storage - deductions - cost;
        const profit =
          importedProfit === undefined
            ? calculatedProfit
            : toNumber(importedProfit);

        return {
          id: index + 1,
          article: String(pick(row, aliases.article) ?? "—"),
          name: String(pick(row, aliases.name) ?? "Без названия"),
          sales: round(sales),
          returns: round(returns),
          commission: round(commission),
          logistics: round(logistics),
          storage: round(storage),
          deductions: round(deductions),
          cost: round(cost),
          profit: round(profit),
        };
      })
      .filter((row) =>
        row.sales !== 0 ||
        row.returns !== 0 ||
        row.commission !== 0 ||
        row.logistics !== 0 ||
        row.storage !== 0 ||
        row.deductions !== 0 ||
        row.cost !== 0 ||
        row.profit !== 0
      );

    if (products.length === 0) {
      return c.json(
        {
          ok: false,
          error:
            "Не удалось распознать финансовые колонки. Нужны продажи, комиссия, логистика и другие показатели.",
        },
        422,
      );
    }

    const sum = (key: keyof (typeof products)[number]) =>
      products.reduce((acc, row) => {
        const value = row[key];
        return acc + (typeof value === "number" ? value : 0);
      }, 0);

    const summary = {
      sales: round(sum("sales")),
      returns: round(sum("returns")),
      commission: round(sum("commission")),
      logistics: round(sum("logistics")),
      storage: round(sum("storage")),
      deductions: round(sum("deductions")),
      cost: round(sum("cost")),
      profit: round(sum("profit")),
    };

    const problems = products
      .filter((product) => product.profit < 0)
      .sort((a, b) => a.profit - b.profit)
      .map((product) => ({
        article: product.article,
        name: product.name,
        profit: product.profit,
        reason:
          product.storage + product.logistics > product.sales * 0.25
            ? "Высокие расходы на логистику и хранение"
            : "Расходы превышают доход по товару",
      }));

    return c.json({
      ok: true,
      file: {
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
      },
      sheet: sheetName,
      rows: products.length,
      summary,
      products,
      problems,
    });
  } catch (error) {
    console.error(error);
    return c.json(
      {
        ok: false,
        error: "Не удалось прочитать отчёт. Проверьте формат XLSX/CSV.",
      },
      422,
    );
  }
});

export const GET = handle(app);
export const POST = handle(app);
