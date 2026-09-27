import { Hono } from "hono";
import { handle } from "hono/vercel";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".csv"];

type Row = Record<string, unknown>;

const simpleAliases = {
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

const wbAliases = {
  operation: ["Обоснование для оплаты", "supplier_oper_name", "sellerOperName"],
  article: ["Код номенклатуры", "Артикул WB", "nm_id", "nmId"],
  name: ["Предмет", "Наименование", "title"],
  retail: [
    "Вайлдберриз реализовал товар (Пр)",
    "retail_amount",
    "retailAmount",
    "Цена розничная с учетом согласованной скидки",
    "Цена розничная с учётом согласованной скидки",
  ],
  sellerForPay: [
    "К перечислению Продавцу за реализованный товар",
    "К перечислению продавцу за реализованный товар",
    "ppvz_for_pay",
    "forPay",
  ],
  delivery: [
    "Услуги по доставке товара покупателю",
    "delivery_rub",
    "deliveryService",
  ],
  storage: ["Хранение", "storage_fee", "storageFee"],
  deductions: ["Удержания", "deduction"],
  penalty: ["Общая сумма штрафов", "penalty"],
  acceptance: ["Операции при приёмке", "Операции при приемке", "acceptance"],
  detail: [
    "Виды логистики, штрафов и корректировок ВВ",
    "Виды доставок, штрафов и корректировок ВВ",
    "bonus_type_name",
    "operationType",
  ],
  commission: [
    "Вознаграждение Вайлдберриз (ВВ), без НДС",
    "Вознаграждение Вайлдберриз (ВВ) без НДС",
    "ppvz_sales_commission",
    "ppvzSalesCommission",
  ],
  acquiring: [
    "Компенсация платёжных услуг/Комиссия за интеграцию платёжных сервисов",
    "Компенсация платежных услуг/Комиссия за интеграцию платежных сервисов",
    "acquiring_fee",
    "acquiringFee",
  ],
} as const;

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function findKey(row: Row, names: readonly string[]) {
  const map = new Map(Object.keys(row).map((key) => [normalizeKey(key), key]));
  for (const name of names) {
    const exact = map.get(normalizeKey(name));
    if (exact) return exact;
  }
  return undefined;
}

function pick(row: Row, names: readonly string[]) {
  const key = findKey(row, names);
  if (!key) return undefined;
  const value = row[key];
  return value === "" || value === null ? undefined : value;
}

function hasAnyColumn(rows: Row[], names: readonly string[]) {
  return rows.some((row) => Boolean(findKey(row, names)));
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

function classifyOperation(value: unknown) {
  const op = normalizeKey(String(value ?? ""));
  if (op.includes("возврат")) return "return";
  if (op.includes("продаж")) return "sale";
  if (op.includes("логист")) return "logistics";
  if (op.includes("хранен")) return "storage";
  if (op.includes("штраф")) return "penalty";
  if (op.includes("удерж")) return "deduction";
  if (op.includes("обработ") || op.includes("приемк")) return "acceptance";
  if (op.includes("компенсац")) return "compensation";
  return "other";
}

function analyzeOfficialWb(rows: Row[]) {
  const summary = {
    retailSales: 0,
    retailReturns: 0,
    sellerAccrualSales: 0,
    sellerAccrualReturns: 0,
    logistics: 0,
    storage: 0,
    deductions: 0,
    penalties: 0,
    acceptance: 0,
    commission: 0,
    acquiring: 0,
    otherAdjustments: 0,
    estimatedPayout: 0,
  };

  const deductionDetails = new Map<string, number>();
  const productMap = new Map<
    string,
    { article: string; name: string; sales: number; returns: number; forPay: number }
  >();

  for (const row of rows) {
    const opRaw = pick(row, wbAliases.operation);
    const kind = classifyOperation(opRaw);

    const retail = Math.abs(toNumber(pick(row, wbAliases.retail)));
    const forPay = Math.abs(toNumber(pick(row, wbAliases.sellerForPay)));
    const delivery = Math.abs(toNumber(pick(row, wbAliases.delivery)));
    const storage = Math.abs(toNumber(pick(row, wbAliases.storage)));
    const deductionRaw = toNumber(pick(row, wbAliases.deductions));
    const penalty = Math.abs(toNumber(pick(row, wbAliases.penalty)));
    const acceptance = Math.abs(toNumber(pick(row, wbAliases.acceptance)));
    const commission = Math.abs(toNumber(pick(row, wbAliases.commission)));
    const acquiring = Math.abs(toNumber(pick(row, wbAliases.acquiring)));

    if (kind === "sale") {
      summary.retailSales += retail;
      summary.sellerAccrualSales += forPay;
    } else if (kind === "return") {
      summary.retailReturns += retail;
      summary.sellerAccrualReturns += forPay;
    }

    summary.logistics += delivery;
    summary.storage += storage;
    summary.penalties += penalty;
    summary.acceptance += acceptance;
    summary.commission += commission;
    summary.acquiring += acquiring;

    if (deductionRaw !== 0) {
      // WB: удержание обычно положительное, выплата/компенсация — со знаком минус.
      summary.deductions += deductionRaw;
      const detail = String(pick(row, wbAliases.detail) ?? "Прочие удержания").trim();
      deductionDetails.set(detail, (deductionDetails.get(detail) ?? 0) + deductionRaw);
    }

    const article = String(pick(row, wbAliases.article) ?? "").trim();
    const name = String(pick(row, wbAliases.name) ?? "").trim();
    if ((kind === "sale" || kind === "return") && (article || name)) {
      const key = article || name;
      const item = productMap.get(key) ?? {
        article: article || "—",
        name: name || "Без названия",
        sales: 0,
        returns: 0,
        forPay: 0,
      };
      if (kind === "sale") {
        item.sales += retail;
        item.forPay += forPay;
      } else {
        item.returns += retail;
        item.forPay -= forPay;
      }
      productMap.set(key, item);
    }
  }

  const goodsNet = summary.sellerAccrualSales - summary.sellerAccrualReturns;
  const deductionsImpact = summary.deductions;
  summary.estimatedPayout =
    goodsNet -
    summary.logistics -
    summary.storage -
    summary.penalties -
    summary.acceptance -
    deductionsImpact;

  const totalRetail = Math.max(summary.retailSales - summary.retailReturns, 1);
  const totalCosts =
    summary.logistics +
    summary.storage +
    summary.penalties +
    summary.acceptance +
    Math.max(summary.deductions, 0);

  const alerts: Array<{
    level: "Высокий" | "Средний";
    title: string;
    amount: number;
    explanation: string;
    action: string;
  }> = [];

  if (summary.deductions > 0) {
    alerts.push({
      level: summary.deductions / totalRetail >= 0.05 ? "Высокий" : "Средний",
      title: "Прочие удержания",
      amount: round(summary.deductions),
      explanation: "В отчёте есть отдельные удержания, не относящиеся напрямую к продаже конкретного товара.",
      action: "Проверьте расшифровку удержаний ниже: штрафы, продвижение, платные услуги и другие списания лучше сверять отдельно.",
    });
  }

  if (summary.penalties > 0) {
    alerts.push({
      level: "Высокий",
      title: "Штрафы",
      amount: round(summary.penalties),
      explanation: "Wildberries списал штрафы в отчётном периоде.",
      action: "Откройте строки со штрафами и проверьте основание каждого взыскания. Спорные начисления имеет смысл зафиксировать отдельно.",
    });
  }

  if (summary.logistics / totalRetail >= 0.15) {
    alerts.push({
      level: summary.logistics / totalRetail >= 0.25 ? "Высокий" : "Средний",
      title: "Высокая стоимость логистики",
      amount: round(summary.logistics),
      explanation: `Логистика составляет около ${Math.round((summary.logistics / totalRetail) * 100)}% чистых продаж за период.`,
      action: "Проверьте габариты, модель поставки, склады и долю возвратной логистики — это основные источники перерасхода.",
    });
  }

  if (summary.storage / totalRetail >= 0.05) {
    alerts.push({
      level: "Средний",
      title: "Хранение заметно влияет на выплату",
      amount: round(summary.storage),
      explanation: `Хранение составляет около ${Math.round((summary.storage / totalRetail) * 100)}% чистых продаж.`,
      action: "Сопоставьте остатки и оборачиваемость: избыточный запас на дорогих складах увеличивает еженедельные списания.",
    });
  }

  const deductionBreakdown = Array.from(deductionDetails.entries())
    .map(([name, amount]) => ({ name, amount: round(amount) }))
    .filter((item) => item.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 15);

  const products = Array.from(productMap.values())
    .map((item) => ({
      ...item,
      sales: round(item.sales),
      returns: round(item.returns),
      forPay: round(item.forPay),
    }))
    .sort((a, b) => a.forPay - b.forPay);

  const expenseVerdicts: Array<{
    category: string;
    amount: number;
    status: "Объяснимо" | "Проверить" | "Основание не подтверждено";
    reason: string;
  }> = [];

  if (summary.logistics > 0) {
    const share = summary.logistics / totalRetail;
    expenseVerdicts.push({
      category: "Логистика",
      amount: round(summary.logistics),
      status: share >= 0.25 ? "Проверить" : "Объяснимо",
      reason:
        share >= 0.25
          ? `Есть понятная категория расхода, но сумма высокая: около ${Math.round(share * 100)}% чистых продаж.`
          : "Это штатная услуга доставки/возвратной логистики WB. Сам факт списания нормален, но размер нужно сверять с тарифом и габаритами.",
    });
  }

  if (summary.storage > 0) {
    const share = summary.storage / totalRetail;
    expenseVerdicts.push({
      category: "Хранение",
      amount: round(summary.storage),
      status: share >= 0.1 ? "Проверить" : "Объяснимо",
      reason:
        share >= 0.1
          ? "Основание понятное, но доля хранения необычно высокая для выручки периода."
          : "Хранение — штатная платная услуга WB. Это не признак ошибки само по себе.",
    });
  }

  if (summary.acceptance > 0) {
    expenseVerdicts.push({
      category: "Приёмка",
      amount: round(summary.acceptance),
      status: "Объяснимо",
      reason:
        "Платная приёмка может отражаться отдельной операцией. Проверять нужно соответствие конкретной поставке и тарифу.",
    });
  }

  if (summary.penalties > 0) {
    expenseVerdicts.push({
      category: "Штрафы",
      amount: round(summary.penalties),
      status: "Проверить",
      reason:
        "Штраф может иметь договорное основание, но его нельзя считать корректным только по факту наличия строки. Нужны причина, событие и основание взыскания.",
    });
  }

  for (const item of deductionBreakdown) {
    const n = normalizeKey(item.name);
    const knownPaidService =
      n.includes("продвиж") ||
      n.includes("реклам") ||
      n.includes("платн") ||
      n.includes("утилизац") ||
      n.includes("кешб") ||
      n.includes("тариф");

    const vague =
      n.includes("проч") ||
      n.includes("коррект") ||
      n === "" ||
      n.includes("неизвест");

    expenseVerdicts.push({
      category: item.name || "Удержание без расшифровки",
      amount: round(item.amount),
      status: vague
        ? "Основание не подтверждено"
        : knownPaidService
          ? "Объяснимо"
          : "Проверить",
      reason: vague
        ? "В отчёте недостаточно конкретное описание. Нельзя уверенно понять, за что удержаны деньги."
        : knownPaidService
          ? "Категория похожа на платную услугу или отдельный тариф WB. Нужно сверить, подключалась ли услуга и совпадает ли сумма."
          : "В отчёте есть расшифровка, но для уверенности нужно сверить её с офертой, тарифом или конкретным событием.",
    });
  }

  const reviewAmount = round(
    expenseVerdicts
      .filter((item) => item.status !== "Объяснимо")
      .reduce((sum, item) => sum + Math.max(item.amount, 0), 0),
  );

  const explainedAmount = round(
    expenseVerdicts
      .filter((item) => item.status === "Объяснимо")
      .reduce((sum, item) => sum + Math.max(item.amount, 0), 0),
  );

  return {
    mode: "wb_official" as const,
    rows: rows.length,
    summary: Object.fromEntries(
      Object.entries(summary).map(([key, value]) => [key, round(value)]),
    ),
    ratios: {
      costsShare: round((totalCosts / totalRetail) * 100),
      logisticsShare: round((summary.logistics / totalRetail) * 100),
      storageShare: round((summary.storage / totalRetail) * 100),
      returnsShare: round((summary.retailReturns / Math.max(summary.retailSales, 1)) * 100),
    },
    alerts,
    deductionBreakdown,
    expenseVerdicts,
    verdictSummary: {
      explainedAmount,
      reviewAmount,
      note:
        reviewAmount > 0
          ? "Эта сумма не означает кражу. Это расходы, корректность которых нельзя подтвердить только по данным текущего отчёта."
          : "По данным отчёта все распознанные списания имеют понятную категорию, но точность сумм всё равно зависит от тарифов и исходных операций.",
    },
    products,
  };
}

function analyzeSimple(rows: Row[]) {
  const products = rows
    .map((row, index) => {
      const sales = toNumber(pick(row, simpleAliases.sales));
      const returns = toNumber(pick(row, simpleAliases.returns));
      const commission = toNumber(pick(row, simpleAliases.commission));
      const logistics = toNumber(pick(row, simpleAliases.logistics));
      const storage = toNumber(pick(row, simpleAliases.storage));
      const deductions = toNumber(pick(row, simpleAliases.deductions));
      const cost = toNumber(pick(row, simpleAliases.cost));
      const importedProfit = pick(row, simpleAliases.profit);
      const calculatedProfit =
        sales - returns - commission - logistics - storage - deductions - cost;
      const profit =
        importedProfit === undefined ? calculatedProfit : toNumber(importedProfit);

      return {
        id: index + 1,
        article: String(pick(row, simpleAliases.article) ?? "—"),
        name: String(pick(row, simpleAliases.name) ?? "Без названия"),
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

  const sum = (key: keyof (typeof products)[number]) =>
    products.reduce((acc, row) => {
      const value = row[key];
      return acc + (typeof value === "number" ? value : 0);
    }, 0);

  return {
    mode: "simple" as const,
    rows: products.length,
    summary: {
      sales: round(sum("sales")),
      returns: round(sum("returns")),
      commission: round(sum("commission")),
      logistics: round(sum("logistics")),
      storage: round(sum("storage")),
      deductions: round(sum("deductions")),
      cost: round(sum("cost")),
      profit: round(sum("profit")),
    },
    products,
  };
}


async function readReportFile(file: File) {
  const lowerName = file.name.toLowerCase();

  if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    throw new Error("Поддерживаются только XLSX и CSV.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Размер файла превышает 20 МБ.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName =
    workbook.SheetNames.find((name) => normalizeKey(name) !== "readme") ??
    workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("В файле нет листов.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Row>(worksheet, {
    defval: null,
    raw: true,
  });

  if (rows.length === 0) {
    throw new Error("В отчёте нет строк с данными.");
  }

  const looksOfficial =
    hasAnyColumn(rows, wbAliases.operation) &&
    (hasAnyColumn(rows, wbAliases.sellerForPay) ||
      hasAnyColumn(rows, wbAliases.delivery) ||
      hasAnyColumn(rows, wbAliases.storage));

  if (!looksOfficial) {
    throw new Error(
      "Для сравнения нужны две детализации еженедельного отчёта реализации WB.",
    );
  }

  return {
    sheetName,
    analysis: analyzeOfficialWb(rows),
  };
}

function buildExpenseMap(
  analysis: ReturnType<typeof analyzeOfficialWb>,
) {
  const map = new Map<string, number>();

  const fixed: Array<[string, number]> = [
    ["Логистика", Number(analysis.summary.logistics ?? 0)],
    ["Хранение", Number(analysis.summary.storage ?? 0)],
    ["Штрафы", Number(analysis.summary.penalties ?? 0)],
    ["Приёмка", Number(analysis.summary.acceptance ?? 0)],
  ];

  for (const [name, amount] of fixed) {
    if (amount !== 0) map.set(name, round(amount));
  }

  for (const item of analysis.deductionBreakdown) {
    map.set(item.name, round((map.get(item.name) ?? 0) + item.amount));
  }

  return map;
}

function compareOfficialReports(
  previous: ReturnType<typeof analyzeOfficialWb>,
  current: ReturnType<typeof analyzeOfficialWb>,
) {
  const previousMap = buildExpenseMap(previous);
  const currentMap = buildExpenseMap(current);

  const categories = Array.from(
    new Set([...previousMap.keys(), ...currentMap.keys()]),
  );

  const changes = categories
    .map((category) => {
      const previousAmount = previousMap.get(category) ?? 0;
      const currentAmount = currentMap.get(category) ?? 0;
      const delta = round(currentAmount - previousAmount);
      const percentChange =
        previousAmount === 0
          ? currentAmount > 0
            ? null
            : 0
          : round((delta / Math.abs(previousAmount)) * 100);

      let kind:
        | "new"
        | "increased"
        | "decreased"
        | "disappeared"
        | "unchanged" = "unchanged";

      if (previousAmount === 0 && currentAmount > 0) {
        kind = "new";
      } else if (previousAmount > 0 && currentAmount === 0) {
        kind = "disappeared";
      } else if (
        previousAmount > 0 &&
        currentAmount >= previousAmount * 1.25 &&
        delta >= 500
      ) {
        kind = "increased";
      } else if (
        previousAmount > 0 &&
        currentAmount <= previousAmount * 0.75 &&
        delta <= -500
      ) {
        kind = "decreased";
      }

      return {
        category,
        previousAmount: round(previousAmount),
        currentAmount: round(currentAmount),
        delta,
        percentChange,
        kind,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const problems = changes.filter(
    (item) => item.kind === "new" || item.kind === "increased",
  );

  const improvements = changes.filter(
    (item) => item.kind === "decreased" || item.kind === "disappeared",
  );

  const previousPayout = Number(previous.summary.estimatedPayout ?? 0);
  const currentPayout = Number(current.summary.estimatedPayout ?? 0);
  const payoutDelta = round(currentPayout - previousPayout);

  const previousSales =
    Number(previous.summary.retailSales ?? 0) -
    Number(previous.summary.retailReturns ?? 0);
  const currentSales =
    Number(current.summary.retailSales ?? 0) -
    Number(current.summary.retailReturns ?? 0);

  return {
    summary: {
      previousPayout: round(previousPayout),
      currentPayout: round(currentPayout),
      payoutDelta,
      previousNetSales: round(previousSales),
      currentNetSales: round(currentSales),
      netSalesDelta: round(currentSales - previousSales),
      newOrIncreasedCount: problems.length,
      improvementCount: improvements.length,
      extraCosts: round(
        problems.reduce((sum, item) => sum + Math.max(item.delta, 0), 0),
      ),
    },
    problems,
    improvements,
    allChanges: changes,
  };
}

app.get("/health", (c) => c.json({ ok: true, service: "wb-mini-app" }));

app.post("/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return c.json({ ok: false, error: "Файл не передан." }, 400);
    }

    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      return c.json({ ok: false, error: "Поддерживаются только XLSX и CSV." }, 415);
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json({ ok: false, error: "Размер файла превышает 20 МБ." }, 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName =
      workbook.SheetNames.find((name) => normalizeKey(name) !== "readme") ??
      workbook.SheetNames[0];

    if (!sheetName) {
      return c.json({ ok: false, error: "В файле нет листов." }, 422);
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Row>(worksheet, { defval: null, raw: true });

    if (rows.length === 0) {
      return c.json({ ok: false, error: "В отчёте нет строк с данными." }, 422);
    }

    const looksOfficial =
      hasAnyColumn(rows, wbAliases.operation) &&
      (hasAnyColumn(rows, wbAliases.sellerForPay) ||
        hasAnyColumn(rows, wbAliases.delivery) ||
        hasAnyColumn(rows, wbAliases.storage));

    const analysis = looksOfficial ? analyzeOfficialWb(rows) : analyzeSimple(rows);

    if (analysis.rows === 0) {
      return c.json(
        {
          ok: false,
          error:
            "Файл открылся, но финансовые колонки не распознаны. Нужна детализация еженедельного отчёта реализации WB или наш тестовый формат.",
        },
        422,
      );
    }

    return c.json({
      ok: true,
      file: { name: file.name, size: file.size, type: file.type || "application/octet-stream" },
      sheet: sheetName,
      ...analysis,
    });
  } catch (error) {
    console.error(error);
    return c.json(
      { ok: false, error: "Не удалось прочитать отчёт. Проверьте формат XLSX/CSV." },
      422,
    );
  }
});


app.post("/compare", async (c) => {
  try {
    const body = await c.req.parseBody();
    const previousFile = body.previousFile;
    const currentFile = body.currentFile;

    if (!(previousFile instanceof File) || !(currentFile instanceof File)) {
      return c.json(
        { ok: false, error: "Нужно загрузить предыдущий и текущий отчёт." },
        400,
      );
    }

    const previousReport = await readReportFile(previousFile);
    const currentReport = await readReportFile(currentFile);

    const comparison = compareOfficialReports(
      previousReport.analysis,
      currentReport.analysis,
    );

    return c.json({
      ok: true,
      mode: "comparison",
      previous: {
        fileName: previousFile.name,
        rows: previousReport.analysis.rows,
        summary: previousReport.analysis.summary,
      },
      current: {
        fileName: currentFile.name,
        rows: currentReport.analysis.rows,
        summary: currentReport.analysis.summary,
      },
      comparison,
    });
  } catch (error) {
    console.error(error);
    return c.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Не удалось сравнить отчёты.",
      },
      422,
    );
  }
});

export const GET = handle(app);
export const POST = handle(app);
