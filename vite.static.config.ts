import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 纯静态 SPA 构建：把“标一下”浏览器端图片标注工具打包成
// 可直接上传到 腾讯云 COS / CloudBase 静态托管 的静态文件。
// 核心功能（Canvas 标注、水印、导出）完全在浏览器端运行，无需 Worker / 服务端。
//
// 以 static/ 为 root：index.html 与 main.tsx 都在 static/ 下，
// 产物会直接输出到 static-dist/ 根（index.html + assets/），便于静态托管。
export default defineConfig({
  root: "static",
  plugins: [react()],
  // 相对 base，部署到域名根或子路径都能正常加载资源
  base: "./",
  publicDir: "../public",
  build: {
    outDir: "../static-dist",
    emptyOutDir: true,
  },
});
