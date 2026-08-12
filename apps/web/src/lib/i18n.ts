import { useEffect } from "react";
import type { LocalizedText } from "@gym/contracts";

export type Locale = "vi" | "en";

const dictionary = {
  vi: {
    today: "Hôm nay",
    routines: "Lịch tập",
    library: "Bài tập",
    nutrition: "Dinh dưỡng",
    progress: "Tiến độ",
    settings: "Cài đặt",
    localOnly: "Dữ liệu trên thiết bị",
    startWorkout: "Bắt đầu tập",
    resumeWorkout: "Tiếp tục buổi tập",
    noData: "Chưa có dữ liệu",
    cancel: "Hủy",
    save: "Lưu",
    close: "Đóng",
    back: "Quay lại"
  },
  en: {
    today: "Today",
    routines: "Routines",
    library: "Exercises",
    nutrition: "Nutrition",
    progress: "Progress",
    settings: "Settings",
    localOnly: "On-device data",
    startWorkout: "Start workout",
    resumeWorkout: "Resume workout",
    noData: "No data yet",
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    back: "Back"
  }
} as const;

export type TranslationKey = keyof typeof dictionary.vi;

export function t(locale: Locale, key: TranslationKey): string {
  return dictionary[locale][key];
}

export function localize(text: LocalizedText, locale: Locale): string {
  return text[locale] || text.vi || text.en;
}

export function formatDate(value: string | Date, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", options ?? {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(value));
}

export function formatNumber(value: number, locale: Locale, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits }).format(value);
}

export function useDocumentLanguage(locale: Locale) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
