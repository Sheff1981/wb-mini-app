"use client";

import { ChangeEvent, useEffect, useState } from "react";

type SimpleSummary = {
  sales: number;
  returns: number;
  commission: number;
  logistics: number;
  storage: number;
  deductions: number;
  cost: number;
  profit: number;
};

type OfficialSummary = {
  retailSales: number;
  retailReturns: number;
  sellerAccrualSales: number;
  sellerAccrualReturns: number;
  logistics: number;
  storage: number;
  deductions: number;
  penalties: number;
  acceptance: number;
  commission: number;
  acquiring: number;
  otherAdjustments: number;
  estimatedPayout: number;
};

type OfficialAlert = {
  level: "Высокий" | "Средний";
  title: string;
  amount: number;
  explanation: string;
  action: string;
};

type OfficialProduct = {
  article: string;
  name: string;
  sales: number;
  returns: number;
  forPay: number;
};

type ExpenseVerdict = {
  category: string;
  amount: number;
  status: "Объяснимо" | "Проверить" | "Основание не подтверждено";
  reason: string;
};

type VerdictSummary = {
  explainedAmount: number;
  reviewAmount: number;
  note: string;
};

type ComparisonChange = {
  category: string;
  previousAmount: number;
  currentAmount: number;
  delta: number;
  percentChange: number | null;
  kind: "new" | "increased" | "decreased" | "disappeared" | "unchanged";
};

type ComparisonResult = {
  ok: boolean;
  mode?: "comparison";
  comparison?: {
    summary: {
      previousPayout: number;
      currentPayout: number;
      payoutDelta: number;
      previousNetSales: number;
      currentNetSales: number;
      netSalesDelta: number;
      newOrIncreasedCount: number;
      improvementCount: number;
      extraCosts: number;
    };
    problems: ComparisonChange[];
    improvements: ComparisonChange[];
    allChanges: ComparisonChange[];
  };
  error?: string;
};

type UploadResult = {
  ok: boolean;
  mode?: "simple" | "wb_official";
  rows?: number;
  summary?: SimpleSummary | OfficialSummary;
  ratios?: {
    costsShare: number;
    logisticsShare: number;
    storageShare: number;
    returnsShare: number;
  };
  alerts?: OfficialAlert[];
  deductionBreakdown?: Array<{ name: string; amount: number }>;
  expenseVerdicts?: ExpenseVerdict[];
  verdictSummary?: VerdictSummary;
  products?: OfficialProduct[] | Array<Record<string, unknown>>;
  error?: string;
};

const rub = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-black/[0.04] p-4">
      <p className="text-xs font-medium text-black/50">{label}</p>
      <p className="mt-1 text-xl font-bold text-black">{rub.format(value)}</p>
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [previousFile, setPreviousFile] = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [compareStatus, setCompareStatus] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    tg.ready();
    tg.expand();
  }, []);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    setStatus("");
  }

  async function upload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setStatus("");

    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const data = (await response.json()) as UploadResult;
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Не удалось проанализировать файл.");
      }

      setResult(data);
      setStatus(
        data.mode === "wb_official"
          ? `Распознана детализация WB: ${data.rows ?? 0} операций`
          : `Проанализировано строк: ${data.rows ?? 0}`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Произошла неизвестная ошибка.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function compareReports() {
    if (!previousFile || !currentFile) return;

    setCompareLoading(true);
    setComparison(null);
    setCompareStatus("");

    try {
      const form = new FormData();
      form.append("previousFile", previousFile);
      form.append("currentFile", currentFile);

      const response = await fetch("/api/compare", {
        method: "POST",
        body: form,
      });

      const data = (await response.json()) as ComparisonResult;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Не удалось сравнить отчёты.");
      }

      setComparison(data);
      setCompareStatus("Сравнение готово");
    } catch (error) {
      setCompareStatus(
        error instanceof Error ? error.message : "Не удалось сравнить отчёты.",
      );
    } finally {
      setCompareLoading(false);
    }
  }

  const officialResult =
    result?.mode === "wb_official" ? result : undefined;

  const official =
    officialResult?.summary as OfficialSummary | undefined;

  const simpleResult =
    result?.mode === "simple" ? result : undefined;

  const simple =
    simpleResult?.summary as SimpleSummary | undefined;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-5 py-8">
      <section className="mb-8">
        <p className="mb-2 text-sm font-medium opacity-60">Telegram Mini App</p>
        <h1 className="text-3xl font-bold tracking-tight">WB Ревизор</h1>
        <p className="mt-3 text-base leading-6 opacity-70">
          Загрузите детализацию еженедельного отчёта WB. Объясним, куда ушли
          деньги и какие списания стоит проверить.
        </p>
      </section>

      <section className="mb-5 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
        <p className="text-sm text-black/50">Сравнение недель</p>
        <h2 className="mt-1 text-xl font-bold">Что изменилось в списаниях</h2>
        <p className="mt-2 text-sm leading-5 text-black/55">
          Загрузите предыдущий и текущий отчёт. Найдём новые списания и резкий рост расходов.
        </p>

        <div className="mt-4 grid gap-3">
          <label className="cursor-pointer rounded-2xl border border-dashed border-black/15 p-4">
            <span className="text-xs font-medium text-black/45">Предыдущий отчёт</span>
            <p className="mt-1 truncate font-semibold">
              {previousFile ? previousFile.name : "Выбрать файл"}
            </p>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(event) => {
                setPreviousFile(event.target.files?.[0] ?? null);
                setComparison(null);
                setCompareStatus("");
              }}
            />
          </label>

          <label className="cursor-pointer rounded-2xl border border-dashed border-black/15 p-4">
            <span className="text-xs font-medium text-black/45">Текущий отчёт</span>
            <p className="mt-1 truncate font-semibold">
              {currentFile ? currentFile.name : "Выбрать файл"}
            </p>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(event) => {
                setCurrentFile(event.target.files?.[0] ?? null);
                setComparison(null);
                setCompareStatus("");
              }}
            />
          </label>
        </div>

        <button
          type="button"
          disabled={!previousFile || !currentFile || compareLoading}
          onClick={compareReports}
          className="mt-4 w-full rounded-2xl bg-black px-5 py-3.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          {compareLoading ? "Сравниваем…" : "Сравнить две недели"}
        </button>

        {compareStatus && (
          <p className="mt-4 rounded-2xl bg-black/5 px-4 py-3 text-sm">
            {compareStatus}
          </p>
        )}
      </section>

      {comparison?.comparison && (() => {
        const cmp = comparison.comparison;
        const payoutWorse = cmp.summary.payoutDelta < 0;

        return (
          <section className="mb-5 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
            <p className="text-sm text-black/50">Изменения относительно прошлой недели</p>
            <h2 className="mt-1 text-2xl font-bold">
              {cmp.summary.newOrIncreasedCount > 0
                ? `Стало хуже: ${cmp.summary.newOrIncreasedCount}`
                : "Новых проблем не найдено"}
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-black/[0.04] p-4">
                <p className="text-xs text-black/45">Изменение выплаты</p>
                <p className={`mt-1 text-xl font-bold ${payoutWorse ? "text-red-600" : "text-emerald-700"}`}>
                  {cmp.summary.payoutDelta > 0 ? "+" : ""}
                  {rub.format(cmp.summary.payoutDelta)}
                </p>
              </div>
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs text-red-700">Дополнительные расходы</p>
                <p className="mt-1 text-xl font-bold text-red-700">
                  {rub.format(cmp.summary.extraCosts)}
                </p>
              </div>
            </div>

            {cmp.problems.length > 0 && (
              <div className="mt-5 space-y-3">
                {cmp.problems.map((item) => (
                  <div
                    key={item.category}
                    className="rounded-2xl border border-red-100 bg-red-50/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-red-700">
                          {item.kind === "new" ? "Новое списание" : "Резкий рост"}
                        </span>
                        <h3 className="mt-3 font-bold">{item.category}</h3>
                      </div>
                      <p className="whitespace-nowrap font-bold text-red-600">
                        +{rub.format(Math.max(item.delta, 0))}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-black/60">
                      Было {rub.format(item.previousAmount)} → стало {rub.format(item.currentAmount)}
                      {item.percentChange !== null ? ` · ${item.percentChange > 0 ? "+" : ""}${item.percentChange}%` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {cmp.improvements.length > 0 && (
              <details className="mt-4 rounded-2xl border border-black/10">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                  Что улучшилось ({cmp.improvements.length})
                </summary>
                <div className="divide-y divide-black/10 border-t border-black/10 px-4">
                  {cmp.improvements.map((item) => (
                    <div key={item.category} className="flex items-center justify-between gap-3 py-3">
                      <span className="text-sm">{item.category}</span>
                      <span className="font-semibold text-emerald-700">
                        {rub.format(item.delta)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        );
      })()}

      <section className="rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
        <label
          htmlFor="report"
          className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-black/15 px-5 text-center"
        >
          <span className="text-base font-semibold">
            {file ? file.name : "Выберите отчёт"}
          </span>
          <span className="mt-2 text-sm text-black/50">
            XLSX или CSV, до 20 МБ
          </span>
          <input
            id="report"
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={onFileChange}
          />
        </label>

        <button
          type="button"
          disabled={!file || loading}
          onClick={upload}
          className="mt-4 w-full rounded-2xl bg-black px-5 py-3.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          {loading ? "Разбираем отчёт…" : "Объяснить, куда ушли деньги"}
        </button>

        {status && (
          <p className="mt-4 rounded-2xl bg-black/5 px-4 py-3 text-sm">
            {status}
          </p>
        )}
      </section>

      {official && officialResult && (
        <>
          <section className="mt-5 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
            <p className="text-sm text-black/50">Итог по отчёту</p>
            <h2 className="mt-1 text-3xl font-bold">
              {rub.format(official.estimatedPayout)}
            </h2>
            <p className="mt-1 text-sm text-black/50">
              Расчётная выплата по операциям детализации
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Tile label="Продажи покупателям" value={official.retailSales} />
              <Tile label="Возвраты" value={official.retailReturns} />
              <Tile label="Начислено за продажи" value={official.sellerAccrualSales} />
              <Tile label="Снято за возвраты" value={official.sellerAccrualReturns} />
            </div>
          </section>

          {officialResult.verdictSummary &&
            officialResult.expenseVerdicts &&
            officialResult.expenseVerdicts.length > 0 && (() => {
              const reviewItems = officialResult.expenseVerdicts.filter(
                (item) => item.status !== "Объяснимо",
              );
              const explainedItems = officialResult.expenseVerdicts.filter(
                (item) => item.status === "Объяснимо",
              );

              return (
                <section className="mt-5 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
                  <p className="text-sm text-black/50">Проверка списаний WB</p>
                  <h2 className="mt-1 text-2xl font-bold">
                    {reviewItems.length === 0
                      ? "Подозрительных списаний не найдено"
                      : `Нужно проверить: ${reviewItems.length}`}
                  </h2>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-emerald-50 p-4">
                      <p className="text-xs font-medium text-emerald-700">
                        Понятное основание
                      </p>
                      <p className="mt-1 text-xl font-bold text-emerald-700">
                        {rub.format(officialResult.verdictSummary.explainedAmount)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-red-50 p-4">
                      <p className="text-xs font-medium text-red-700">
                        Требует проверки
                      </p>
                      <p className="mt-1 text-xl font-bold text-red-700">
                        {rub.format(officialResult.verdictSummary.reviewAmount)}
                      </p>
                    </div>
                  </div>

                  {reviewItems.length > 0 && (
                    <div className="mt-5 space-y-3">
                      {reviewItems.map((item, index) => {
                        const statusClass =
                          item.status === "Проверить"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-red-50 text-red-700";

                        return (
                          <div
                            key={`${item.category}-${index}`}
                            className="rounded-2xl border border-red-100 bg-red-50/40 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                                >
                                  {item.status}
                                </span>
                                <h3 className="mt-3 font-bold">{item.category}</h3>
                              </div>
                              <p className="whitespace-nowrap font-bold text-red-600">
                                {rub.format(item.amount)}
                              </p>
                            </div>
                            <p className="mt-2 text-sm leading-5 text-black/65">
                              {item.reason}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <p className="mt-4 rounded-2xl bg-black/[0.04] p-3 text-xs leading-5 text-black/55">
                    {officialResult.verdictSummary.note}
                  </p>

                  {explainedItems.length > 0 && (
                    <details className="mt-4 rounded-2xl border border-black/10 bg-white">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                        Показать объяснимые списания ({explainedItems.length})
                      </summary>
                      <div className="divide-y divide-black/10 border-t border-black/10 px-4">
                        {explainedItems.map((item, index) => (
                          <div
                            key={`explained-${item.category}-${index}`}
                            className="py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium">{item.category}</p>
                              <p className="whitespace-nowrap font-semibold text-emerald-700">
                                {rub.format(item.amount)}
                              </p>
                            </div>
                            <p className="mt-1 text-sm leading-5 text-black/55">
                              {item.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </section>
              );
            })()}
        </>
      )}

      {simple && (
        <section className="mt-5 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
          <p className="text-sm text-black/50">Тестовый формат</p>
          <h2 className="mt-1 text-2xl font-bold">{rub.format(simple.profit)}</h2>
          <p className="text-sm text-black/50">Расчётная прибыль</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Tile label="Продажи" value={simple.sales} />
            <Tile label="Возвраты" value={simple.returns} />
            <Tile label="Комиссия WB" value={simple.commission} />
            <Tile label="Логистика" value={simple.logistics} />
            <Tile label="Хранение" value={simple.storage} />
            <Tile label="Удержания" value={simple.deductions} />
          </div>
        </section>
      )}

      <p className="mt-8 text-center text-xs text-black/35">
        Анализ носит расчётный характер и зависит от данных в загруженном отчёте.
      </p>
    </main>
  );
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready(): void;
        expand(): void;
        colorScheme: "light" | "dark";
        initData: string;
        initDataUnsafe: unknown;
      };
    };
  }
}
