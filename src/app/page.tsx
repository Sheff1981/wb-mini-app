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
            <p className="text-sm text-black/50">Расшифровка выплаты</p>
            <h2 className="mt-1 text-3xl font-bold">
              {rub.format(official.estimatedPayout)}
            </h2>
            <p className="mt-1 text-sm text-black/50">
              Расчётный итог по операциям детализации
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
            officialResult.expenseVerdicts.length > 0 && (
              <section className="mt-5 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
                <p className="text-sm text-black/50">Ревизия списаний</p>
                <h2 className="mt-1 text-2xl font-bold">
                  Где WB забрал деньги
                </h2>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-xs font-medium text-emerald-700">
                      Объяснимо по отчёту
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

                <div className="mt-4 space-y-3">
                  {officialResult.expenseVerdicts.map((item, index) => {
                    const statusClass =
                      item.status === "Объяснимо"
                        ? "bg-emerald-50 text-emerald-700"
                        : item.status === "Проверить"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-red-50 text-red-700";

                    return (
                      <div
                        key={`${item.category}-${index}`}
                        className="rounded-2xl border border-black/5 p-4"
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
                          <p className="whitespace-nowrap font-bold">
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

                <p className="mt-4 rounded-2xl bg-black/[0.04] p-3 text-xs leading-5 text-black/55">
                  {officialResult.verdictSummary.note}
                </p>
              </section>
            )}

          <section className="mt-5 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
            <h2 className="text-xl font-bold">Куда ушли деньги</h2>
            <div className="mt-4 space-y-3">
              {[
                ["Логистика", official.logistics],
                ["Хранение", official.storage],
                ["Удержания", official.deductions],
                ["Штрафы", official.penalties],
                ["Приёмка", official.acceptance],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between rounded-2xl bg-black/[0.04] px-4 py-3"
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="font-bold">{rub.format(Number(value))}</span>
                </div>
              ))}
            </div>

            {officialResult.ratios && (
              <div className="mt-4 rounded-2xl bg-black p-4 text-white">
                <p className="text-sm font-semibold">
                  Все основные списания: {officialResult.ratios.costsShare}% от чистых
                  продаж
                </p>
                <p className="mt-1 text-xs text-white/65">
                  Логистика {officialResult.ratios.logisticsShare}% · хранение{" "}
                  {officialResult.ratios.storageShare}% · возвраты{" "}
                  {officialResult.ratios.returnsShare}%
                </p>
              </div>
            )}
          </section>

          {officialResult.alerts && officialResult.alerts.length > 0 && (
            <section className="mt-5 rounded-3xl border border-red-200 bg-white p-5 text-black shadow-sm">
              <h2 className="text-xl font-bold">
                Что проверить: {officialResult.alerts.length}
              </h2>
              <div className="mt-4 space-y-3">
                {officialResult.alerts.map((alert, index) => (
                  <div key={index} className="rounded-2xl bg-red-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-red-700">
                          {alert.level}
                        </span>
                        <h3 className="mt-3 font-bold">{alert.title}</h3>
                      </div>
                      <p className="whitespace-nowrap font-bold text-red-600">
                        {rub.format(alert.amount)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-black/65">
                      {alert.explanation}
                    </p>
                    <div className="mt-3 rounded-xl bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-black/40">
                        Что делать
                      </p>
                      <p className="mt-1 text-sm leading-5 text-black/75">
                        {alert.action}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {officialResult.deductionBreakdown &&
            officialResult.deductionBreakdown.length > 0 && (
              <section className="mt-5 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
                <h2 className="text-xl font-bold">Расшифровка удержаний</h2>
                <div className="mt-3 divide-y divide-black/10">
                  {officialResult.deductionBreakdown.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start justify-between gap-4 py-3"
                    >
                      <p className="text-sm leading-5 text-black/70">{item.name}</p>
                      <p
                        className={`whitespace-nowrap font-semibold ${
                          item.amount > 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {rub.format(item.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
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
