"use client";

import { ChangeEvent, useEffect, useState } from "react";

type UploadResult = {
  ok: boolean;
  file?: {
    name: string;
    size: number;
    type: string;
  };
  error?: string;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg) return;

    tg.ready();
    tg.expand();

    if (tg.colorScheme === "dark") {
      document.documentElement.style.setProperty("--background", "#111315");
      document.documentElement.style.setProperty("--foreground", "#f4f4f5");
    }
  }, []);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setStatus("");
  }

  async function upload() {
    if (!file) return;

    setLoading(true);
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
        throw new Error(data.error ?? "Не удалось загрузить файл.");
      }

      setStatus(`Файл принят: ${data.file?.name ?? file.name}`);
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
          Загрузите отчёт Wildberries. Мы покажем, куда уходят деньги и какие
          товары требуют внимания.
        </p>
      </section>

      <section className="rounded-3xl border border-black/10 bg-white p-5 text-black shadow-sm">
        <label
          htmlFor="report"
          className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-black/15 px-5 text-center"
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
          {loading ? "Загрузка…" : "Анализировать отчёт"}
        </button>

        {status && (
          <p className="mt-4 rounded-2xl bg-black/5 px-4 py-3 text-sm">
            {status}
          </p>
        )}
      </section>

      <p className="mt-auto pt-8 text-center text-xs opacity-40">
        Первая версия MVP
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
