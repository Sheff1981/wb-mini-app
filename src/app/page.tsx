"use client";

import { ChangeEvent, useEffect, useState } from "react";

type MoneySummary = {
  sales: number;
  returns: number;
  commission: number;
  logistics: number;
  storage: number;
  deductions: number;
  cost: number;
  profit: number;
};

type Product = {
  id: number;
  article: string;
  name: string;
  sales: number;
  returns: number;
  commission: number;
  logistics: number;
  storage: number;
  deductions: number;
  cost: number;
  profit: number;
};

type Problem = {
  article: string;
  name: string;
  profit: number;
  priority: "Высокий" | "Средний";
  reason: string;
  metrics: {
    logisticsStorageShare: number;
    returnsShare: number;
    commissionShare: number;
    deductionsShare: number;
    totalVariableCosts: number;
  };
  recommendations: string[];
};

type UploadResult = {
  ok: boolean;
  file?: {
    name: string;
    size: number;
    type: string;
  };
  sheet?: string;
  rows?: number;
  summary?: MoneySummary;
  products?: Product[];
  problems?: Problem[];
  error?: string;
};

const rub = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

function MoneyCard({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-black/[0.04] p-4">
      <p className="text-xs font-medium text-black/50">{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${
          negative ? "text-red-600" : "text-black"
        }`}
      >
        {rub.format(value)}
      </p>
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg) return;

    tg.ready();
    tg.expand();
  }, []);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
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
      setStatus(`Проанализировано строк: ${data.rows ?? 0}`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Произошла неизвестная ошибка.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-5 py-8">
      <section className="mb-8">
        <p className="mb-2 text-sm font-medium opacity-60">Telegram Mini App</p>
        <h1 className="text-3xl font-bold tracking-tight">WB Аналитик</h1>
        <p className="mt-3 text-base leading-6 opacity-70">
          Загрузите отчёт Wildberries. Покажем, куда уходят деньги и какие
          товары требуют внимания.
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
          {loading ? "Анализируем…" : "Анализировать отчёт"}
        </button>

        {status && (
          <p className="mt-4 rounded-2xl bg-black/5 px-4 py-3 text-sm">
            {status}
          </p>
        )}
      </section>

      {result?.summary && (
        <section className="mt-5 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
          <div className="mb-4">
            <p className="text-sm text-black/50">Результат анализа</p>
            <h2 className="text-2xl font-bold">
              {rub.format(result.summary.profit)}
            </h2>
            <p className="text-sm text-black/50">Расчётная прибыль</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MoneyCard label="Продажи" value={result.summary.sales} />
            <MoneyCard label="Возвраты" value={result.summary.returns} />
            <MoneyCard label="Комиссия WB" value={result.summary.commission} />
            <MoneyCard label="Логистика" value={result.summary.logistics} />
            <MoneyCard label="Хранение" value={result.summary.storage} />
            <MoneyCard label="Удержания" value={result.summary.deductions} />
          </div>
        </section>
      )}

      {result?.problems && result.problems.length > 0 && (
        <section className="mt-5 rounded-3xl border border-red-200 bg-white p-5 text-black shadow-sm">
          <h2 className="text-xl font-bold">
            Где теряются деньги: {result.problems.length}
          </h2>

          <div className="mt-4 space-y-3">
            {result.problems.map((problem) => (
              <div
                key={`${problem.article}-${problem.name}`}
                className="rounded-2xl bg-red-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{problem.name}</p>
                    <p className="mt-1 text-xs text-black/50">
                      {problem.article}
                    </p>
                  </div>
                  <p className="whitespace-nowrap font-bold text-red-600">
                    {rub.format(problem.profit)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-red-700">
                    Приоритет: {problem.priority}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-black/60">
                    Логистика + хранение: {problem.metrics.logisticsStorageShare}%
                  </span>
                  {problem.metrics.returnsShare > 0 && (
                    <span className="rounded-full bg-white px-2.5 py-1 text-black/60">
                      Возвраты: {problem.metrics.returnsShare}%
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm font-medium text-black/75">
                  Почему:
                </p>
                <p className="mt-1 text-sm text-black/65">{problem.reason}</p>

                <div className="mt-4 rounded-xl bg-white p-3">
                  <p className="text-sm font-semibold">Что делать</p>
                  <ul className="mt-2 space-y-2">
                    {problem.recommendations.map((recommendation, index) => (
                      <li
                        key={index}
                        className="flex gap-2 text-sm leading-5 text-black/70"
                      >
                        <span className="font-bold text-black/35">•</span>
                        <span>{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {result?.products && result.products.length > 0 && (
        <section className="mt-5 mb-8 rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
          <h2 className="text-xl font-bold">Товары</h2>
          <div className="mt-3 divide-y divide-black/10">
            {result.products
              .slice()
              .sort((a, b) => a.profit - b.profit)
              .map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{product.name}</p>
                    <p className="text-xs text-black/45">{product.article}</p>
                  </div>
                  <p
                    className={`whitespace-nowrap font-semibold ${
                      product.profit < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {rub.format(product.profit)}
                  </p>
                </div>
              ))}
          </div>
        </section>
      )}
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
