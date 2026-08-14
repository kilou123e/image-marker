import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "标一下｜轻量图片标注工具", description: "上传或粘贴图片，快速添加高亮、线框、文字、箭头和水印。" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
