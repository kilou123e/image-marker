"use client";

import { ChangeEvent, PointerEvent, useCallback, useEffect, useRef, useState } from "react";

type Tool = "rect" | "highlight" | "line" | "arrow" | "text";
type Point = { x: number; y: number };
type Mark = { id: number; tool: Tool | "watermark"; start: Point; end: Point; color: string; width: number; text?: string; opacity?: number; repeat?: boolean };

const tools: { id: Tool; icon: string; label: string }[] = [
  { id: "rect", icon: "□", label: "线框" }, { id: "highlight", icon: "▰", label: "高亮" },
  { id: "arrow", icon: "↗", label: "箭头" }, { id: "line", icon: "╱", label: "直线" }, { id: "text", icon: "T", label: "文字" },
];
const colors = ["#ff5a36", "#ffb000", "#17a673", "#2774e6", "#8b5cf6", "#171717"];

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null), imageRef = useRef<HTMLImageElement | null>(null), fileRef = useRef<HTMLInputElement>(null);
  const dragStart = useRef<Point | null>(null), nextId = useRef(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fileName, setFileName] = useState(""), [tool, setTool] = useState<Tool>("rect"), [color, setColor] = useState(colors[0]);
  const [lineWidth, setLineWidth] = useState(5), [marks, setMarks] = useState<Mark[]>([]), [redo, setRedo] = useState<Mark[]>([]);
  const [preview, setPreview] = useState<Mark | null>(null), [dragging, setDragging] = useState(false), [watermarkOpen, setWatermarkOpen] = useState(false);
  const [watermark, setWatermark] = useState("仅供展示"), [watermarkOpacity, setWatermarkOpacity] = useState(22), [repeatWatermark, setRepeatWatermark] = useState(true);

  const drawMark = useCallback((ctx: CanvasRenderingContext2D, mark: Mark) => {
    const { start, end } = mark;
    ctx.save(); ctx.strokeStyle = mark.color; ctx.fillStyle = mark.color; ctx.lineWidth = mark.width; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (mark.tool === "rect") ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    else if (mark.tool === "highlight") { ctx.globalAlpha = .28; ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y); }
    else if (mark.tool === "line" || mark.tool === "arrow") {
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      if (mark.tool === "arrow") {
        const angle = Math.atan2(end.y - start.y, end.x - start.x), head = Math.max(18, mark.width * 4);
        ctx.beginPath(); ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y); ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6)); ctx.stroke();
      }
    } else if (mark.tool === "text") {
      ctx.font = `700 ${Math.max(24, mark.width * 7)}px system-ui, sans-serif`; ctx.textBaseline = "top"; ctx.fillText(mark.text || "文字", start.x, start.y);
    } else {
      ctx.globalAlpha = mark.opacity ?? .22; ctx.font = "700 34px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (mark.repeat) {
        ctx.translate(size.width / 2, size.height / 2); ctx.rotate(-Math.PI / 7);
        for (let y = -size.height; y <= size.height; y += 150) for (let x = -size.width; x <= size.width; x += 310) ctx.fillText(mark.text || "水印", x, y);
      } else ctx.fillText(mark.text || "水印", size.width - 130, size.height - 55);
    }
    ctx.restore();
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current, image = imageRef.current;
    if (!canvas || !image || !size.width) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height); ctx.drawImage(image, 0, 0, size.width, size.height);
    marks.forEach((mark) => drawMark(ctx, mark)); if (preview) drawMark(ctx, preview);
  }, [marks, preview, size, drawMark]);

  const getPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!, box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height };
  };
  const loadFile = useCallback((file?: File | null) => {
    if (!file?.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      imageRef.current = image; setSize({ width: Math.round(image.naturalWidth * scale), height: Math.round(image.naturalHeight * scale) });
      setFileName(file.name); setMarks([]); setRedo([]); URL.revokeObjectURL(url);
    };
    image.src = url;
  }, []);
  const commit = (mark: Mark) => { setMarks((items) => [...items, mark]); setRedo([]); };
  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = getPoint(event);
    if (tool === "text") { const text = window.prompt("输入要添加的文字"); if (text?.trim()) commit({ id: nextId.current++, tool, start: point, end: point, color, width: lineWidth, text: text.trim() }); return; }
    event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; setDragging(true); setPreview({ id: 0, tool, start: point, end: point, color, width: lineWidth });
  };
  const moveDrawing = (event: PointerEvent<HTMLCanvasElement>) => { if (dragStart.current) setPreview({ id: 0, tool, start: dragStart.current, end: getPoint(event), color, width: lineWidth }); };
  const finishDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart.current) return; const end = getPoint(event), start = dragStart.current;
    if (Math.hypot(end.x - start.x, end.y - start.y) > 5) commit({ id: nextId.current++, tool, start, end, color, width: lineWidth });
    dragStart.current = null; setDragging(false); setPreview(null);
  };
  const undo = () => setMarks((items) => { if (!items.length) return items; setRedo((future) => [...future, items.at(-1)!]); return items.slice(0, -1); });
  const redoLast = () => setRedo((items) => { if (!items.length) return items; setMarks((past) => [...past, items.at(-1)!]); return items.slice(0, -1); });
  const addWatermark = () => {
    if (!watermark.trim() || !imageRef.current) return;
    commit({ id: nextId.current++, tool: "watermark", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, color, width: 1, text: watermark.trim(), opacity: watermarkOpacity / 100, repeat: repeatWatermark }); setWatermarkOpen(false);
  };
  const download = () => {
    const canvas = canvasRef.current; if (!canvas) return; const link = document.createElement("a");
    link.download = `${fileName.replace(/\.[^.]+$/, "") || "标注图片"}-marked.png`; link.href = canvas.toDataURL("image/png"); link.click();
  };
  useEffect(() => {
    const paste = (event: ClipboardEvent) => loadFile([...event.clipboardData.items].find((item) => item.type.startsWith("image/"))?.getAsFile());
    window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste);
  }, [loadFile]);

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">↗</span><strong>标一下</strong><em>轻量图片标注</em></div>
      <div className="top-actions"><button className="icon-button" onClick={undo} disabled={!marks.length} aria-label="撤销">↶</button><button className="icon-button" onClick={redoLast} disabled={!redo.length} aria-label="重做">↷</button><button className="download-button" onClick={download} disabled={!size.width}>下载图片 <span>↓</span></button></div>
    </header>
    <section className="toolbar" aria-label="标注工具栏">
      <div className="tool-group">{tools.map((item) => <button key={item.id} className={`tool-button ${tool === item.id ? "active" : ""}`} onClick={() => setTool(item.id)} aria-pressed={tool === item.id}><span>{item.icon}</span>{item.label}</button>)}</div>
      <div className="divider" />
      <div className="colors" aria-label="颜色">{colors.map((item) => <button key={item} className={color === item ? "selected" : ""} style={{ background: item }} onClick={() => setColor(item)} aria-label={`选择颜色 ${item}`} />)}<label className="custom-color" title="自定义颜色"><input type="color" value={color} onChange={(e: ChangeEvent<HTMLInputElement>) => setColor(e.target.value)} /><span>＋</span></label></div>
      <label className="width-control">粗细<input type="range" min="2" max="14" value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} /></label>
      <button className={`watermark-button ${watermarkOpen ? "active" : ""}`} onClick={() => setWatermarkOpen((open) => !open)}>W 水印</button>
    </section>
    {watermarkOpen && <section className="watermark-panel">
      <label>水印文字<input value={watermark} onChange={(e) => setWatermark(e.target.value)} autoFocus /></label>
      <label className="opacity">透明度<input type="range" min="8" max="70" value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} /><span>{watermarkOpacity}%</span></label>
      <label className="check"><input type="checkbox" checked={repeatWatermark} onChange={(e) => setRepeatWatermark(e.target.checked)} />平铺</label><button onClick={addWatermark}>添加水印</button>
    </section>}
    <section className={`workspace ${dragging ? "drawing" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
      {!size.width ? <button className="drop-zone" onClick={() => fileRef.current?.click()}><span className="upload-art"><i>↑</i></span><strong>拖入一张图片，开始标注</strong><small>或点击选择图片 · 也可以直接粘贴截图</small><b>选择图片</b></button> :
        <div className="canvas-stage"><canvas ref={canvasRef} width={size.width} height={size.height} onPointerDown={startDrawing} onPointerMove={moveDrawing} onPointerUp={finishDrawing} onPointerCancel={finishDrawing} aria-label="图片标注画布" /><div className="image-meta"><span>{fileName}</span><button onClick={() => fileRef.current?.click()}>更换图片</button></div></div>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
    </section>
    <footer><span>图片仅在你的浏览器中处理</span><span>画错了？按撤销即可</span></footer>
  </main>;
}
