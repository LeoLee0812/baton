import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 这三个解析包体积大 / 内部有动态 require，必须让 Next 走运行时 require 而不是打包进函数
  serverExternalPackages: ["unpdf", "mammoth", "exceljs"],
};

export default nextConfig;
