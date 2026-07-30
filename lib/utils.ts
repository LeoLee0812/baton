// shadcn 约定的 className 合并工具：把条件类名与 tailwind 冲突类合并成最终字符串
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
