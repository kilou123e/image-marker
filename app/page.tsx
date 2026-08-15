"use client";

import { ChangeEvent, PointerEvent, useCallback, useEffect, useRef, useState } from "react";

type Tool = "select" | "rect" | "circle" | "highlight" | "blur" | "blurCircle" | "line" | "arrow" | "text";
type WatermarkMode = "corner" | "center" | "diagonal" | "tile" | "tileHorizontal" | "tileVertical";
type WatermarkTab = "text" | "image" | "saved";
type ImageBlendMode = "source-over" | "multiply";
type Point = { x: number; y: number };
type Mark = { id: number; tool: Exclude<Tool, "select"> | "watermark"; start: Point; end: Point; color: string; width: number; radius?: number; text?: string; opacity?: number; repeat?: boolean; watermarkMode?: WatermarkMode; image?: string; blendMode?: ImageBlendMode; rotation?: number };
type SavedWatermark = { id: number; text?: string; image?: string; imageWidth?: number; imageHeight?: number; rotation?: number; blendMode?: ImageBlendMode; color: string; width: number; opacity: number; watermarkMode: WatermarkMode };

const tools: { id: Tool; icon: string; label: string; shortcut: string }[] = [
  { id: "select", icon: "select", label: "移动", shortcut: "V" },
  { id: "rect", icon: "rect", label: "线框", shortcut: "R" }, { id: "circle", icon: "circle", label: "圆框", shortcut: "C" }, { id: "highlight", icon: "highlight", label: "高亮", shortcut: "H" }, { id: "blur", icon: "blur", label: "模糊", shortcut: "B" }, { id: "blurCircle", icon: "blurCircle", label: "圆模糊", shortcut: "O" },
  { id: "arrow", icon: "arrow", label: "箭头", shortcut: "A" }, { id: "line", icon: "line", label: "直线", shortcut: "L" }, { id: "text", icon: "text", label: "文字", shortcut: "T" },
];
const colors = ["#00e1ff", "#ff00ea", "#ff5a36", "#ffb000", "#17a673", "#2774e6", "#8b5cf6", "#171717"];
const watermarkAnchor = (mode: WatermarkMode, width: number, height: number) => mode === "corner" ? { x: width - 130, y: height - 55 } : { x: width / 2, y: height / 2 };
const defaultTextRotation = (mode: WatermarkMode) => mode === "tile" || mode === "tileHorizontal" || mode === "tileVertical" || mode === "diagonal" ? -Math.PI / 7 : 0;
const imageWatermarkGeometry = (canvasWidth: number, canvasHeight: number, ratio: number, position?: Point | null, dimensions?: { width: number; height: number } | null) => { const width = dimensions?.width ?? Math.min(220, canvasWidth * .35), height = dimensions?.height ?? width / ratio, start = position ?? { x: Math.max(16, canvasWidth - width - 28), y: Math.max(16, canvasHeight - height - 28) }; return { width, height, start }; };
const isWatermarkHit = (point: Point, mark: Mark, width: number, height: number) => {
  if (mark.image) { const center = { x: (mark.start.x + mark.end.x) / 2, y: (mark.start.y + mark.end.y) / 2 }, angle = -(mark.rotation ?? 0), dx = point.x - center.x, dy = point.y - center.y, x = center.x + dx * Math.cos(angle) - dy * Math.sin(angle), y = center.y + dx * Math.sin(angle) + dy * Math.cos(angle); return x >= Math.min(mark.start.x, mark.end.x) && x <= Math.max(mark.start.x, mark.end.x) && y >= Math.min(mark.start.y, mark.end.y) && y <= Math.max(mark.start.y, mark.end.y); }
  const mode = mark.watermarkMode ?? (mark.repeat ? "tile" : "corner");
  if (mode === "tile" || mode === "tileHorizontal" || mode === "tileVertical") return point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
  const fontSize = Math.max(12, mark.width || 34), textWidth = Math.max(fontSize, (mark.text || "水印").length * fontSize * .92), angle = -(mark.rotation ?? defaultTextRotation(mode)), dx = point.x - mark.start.x, dy = point.y - mark.start.y, x = dx * Math.cos(angle) - dy * Math.sin(angle), y = dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.abs(x) <= textWidth / 2 && Math.abs(y) <= fontSize / 2;
};
let textMeasureContext: CanvasRenderingContext2D | null = null;
const getTextBounds = (mark: Mark) => {
  const fontSize = Math.max(12, mark.width * 7), text = mark.text || "文字";
  if (typeof document !== "undefined") textMeasureContext ??= document.createElement("canvas").getContext("2d");
  if (textMeasureContext) textMeasureContext.font = `700 ${fontSize}px system-ui, sans-serif`;
  const textWidth = Math.max(fontSize, textMeasureContext?.measureText(text).width ?? text.length * fontSize * .92);
  const left = mark.start.x - 8, top = mark.start.y - 6, right = mark.start.x + textWidth + 8, bottom = mark.start.y + fontSize * 1.2 + 6, rotation = mark.rotation ?? 0;
  if (!rotation) return { left, top, right, bottom };
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 }, corners = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }].map((point) => { const dx = point.x - center.x, dy = point.y - center.y, cos = Math.cos(rotation), sin = Math.sin(rotation); return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }; });
  return { left: Math.min(...corners.map((point) => point.x)), top: Math.min(...corners.map((point) => point.y)), right: Math.max(...corners.map((point) => point.x)), bottom: Math.max(...corners.map((point) => point.y)) };
};
const getMarkBounds = (mark: Mark) => {
  if (mark.tool === "text") return getTextBounds(mark);
  if (mark.tool === "watermark" && !mark.image) { const fontSize = Math.max(12, mark.width || 34), textWidth = Math.max(fontSize, (mark.text || "水印").length * fontSize * .92); return { left: mark.start.x - textWidth / 2, top: mark.start.y - fontSize / 2, right: mark.start.x + textWidth / 2, bottom: mark.start.y + fontSize / 2 }; }
  const pad = 10;
  return { left: Math.min(mark.start.x, mark.end.x) - pad, top: Math.min(mark.start.y, mark.end.y) - pad, right: Math.max(mark.start.x, mark.end.x) + pad, bottom: Math.max(mark.start.y, mark.end.y) + pad };
};
const watermarkDeletePoint = (mark: Mark, size: { width: number; height: number }) => {
  const mode = mark.watermarkMode ?? (mark.repeat ? "tile" : "corner");
  if (!mark.image && (mode === "tile" || mode === "tileHorizontal" || mode === "tileVertical")) return { x: size.width - 38, y: 38 };
  const bounds = getMarkBounds(mark);
  return { x: Math.min(size.width - 20, bounds.right + 18), y: Math.max(20, bounds.top - 18) };
};
const drawWatermarkDeleteHandle = (ctx: CanvasRenderingContext2D, point: Point) => {
  ctx.fillStyle = "#ff5a36"; ctx.beginPath(); ctx.arc(point.x, point.y, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "white"; ctx.lineWidth = 2.8; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(point.x - 4, point.y - 4); ctx.lineTo(point.x + 4, point.y + 4); ctx.moveTo(point.x + 4, point.y - 4); ctx.lineTo(point.x - 4, point.y + 4); ctx.stroke();
};
const distanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x, dy = end.y - start.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
};
const roundedRectPath = (ctx: CanvasRenderingContext2D, start: Point, end: Point, radius: number) => {
  const left = Math.min(start.x, end.x), top = Math.min(start.y, end.y), width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
  const r = Math.min(Math.max(0, radius), width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(left + r, top); ctx.lineTo(left + width - r, top); ctx.quadraticCurveTo(left + width, top, left + width, top + r);
  ctx.lineTo(left + width, top + height - r); ctx.quadraticCurveTo(left + width, top + height, left + width - r, top + height);
  ctx.lineTo(left + r, top + height); ctx.quadraticCurveTo(left, top + height, left, top + height - r); ctx.lineTo(left, top + r); ctx.quadraticCurveTo(left, top, left + r, top); ctx.closePath();
};
const constrainSquare = (start: Point, end: Point) => {
  const dx = end.x - start.x, dy = end.y - start.y, side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) };
};
const snapLineAngle = (start: Point, end: Point) => { const length = Math.hypot(end.x - start.x, end.y - start.y), angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / (Math.PI / 4)) * Math.PI / 4; return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length }; };
console.assert(distanceToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }) === 5, "标注命中检测失败");
const ToolIcon = ({ icon }: { icon: string }) => {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const shapes = {
    select: <path {...common} d="M12 3v18M3 12h18M12 3 9 6m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3" />,
    rect: <rect {...common} x="4" y="4" width="16" height="16" rx="2" />,
    circle: <circle {...common} cx="12" cy="12" r="8" />,
    highlight: <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />,
    blur: <><circle {...common} cx="8" cy="8" r="2.2" /><circle {...common} cx="16" cy="8" r="2.2" /><circle {...common} cx="8" cy="16" r="2.2" /><circle {...common} cx="16" cy="16" r="2.2" /></>,
    blurCircle: <><circle {...common} cx="12" cy="12" r="8" /><circle fill="currentColor" cx="9" cy="9" r="1.8" /><circle fill="currentColor" cx="15" cy="9" r="1.8" /><circle fill="currentColor" cx="9" cy="15" r="1.8" /><circle fill="currentColor" cx="15" cy="15" r="1.8" /></>,
    arrow: <path {...common} d="M5 19 19 5m0 0h-7m7 0v7" />,
    line: <path {...common} d="M5 19 19 5" />,
    text: <path {...common} d="M5 5h14M12 5v14M8 19h8" />,
  }[icon as Tool];
  return <svg className="tool-glyph" viewBox="0 0 24 24" aria-hidden="true">{shapes}</svg>;
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null), imageRef = useRef<HTMLImageElement | null>(null), fileRef = useRef<HTMLInputElement>(null), watermarkFileRef = useRef<HTMLInputElement>(null), watermarkImages = useRef<Record<string, HTMLImageElement>>({}), blurCache = useRef<Record<number, { key: string; canvas: HTMLCanvasElement; x: number; y: number }>>({});
  const dragStart = useRef<Point | null>(null), moveSnapshot = useRef<Mark[] | null>(null), widthSnapshot = useRef<Mark[] | null>(null), watermarkDrag = useRef<{ start: Point; origin: Point } | null>(null), watermarkDraftResize = useRef<{ origin: Point; size: { width: number; height: number } } | null>(null), watermarkDraftOpacity = useRef<{ origin: Point; opacity: number } | null>(null), watermarkDraftRotate = useRef<{ center: Point; angleOffset: number } | null>(null), cornerDragData = useRef<{ id: number; origin: Point; snapshot: Mark[] } | null>(null), shapeWidthData = useRef<{ id: number; origin: Point; snapshot: Mark[] } | null>(null), blurDragData = useRef<{ id: number; origin: Point; snapshot: Mark[] } | null>(null), shapeResizeData = useRef<{ id: number; fixed: Point; offset: Point; snapshot: Mark[] } | null>(null), lineResizeData = useRef<{ id: number; endpoint: "start" | "end"; snapshot: Mark[] } | null>(null), resizeData = useRef<{ id: number; anchor: Point; baseWidth: number; baseHeight: number; width: number; snapshot: Mark[] } | null>(null), nextId = useRef(1);
  const rotateData = useRef<{ id: number; center: Point; length: number; snapshot: Mark[] } | null>(null), textRotateData = useRef<{ id: number; center: Point; angleOffset: number; snapshot: Mark[] } | null>(null);
  const imageOpacityData = useRef<{ id: number; origin: Point; snapshot: Mark[] } | null>(null), textOpacityData = useRef<{ id: number; origin: Point; snapshot: Mark[] } | null>(null), imageRotateData = useRef<{ id: number; center: Point; angleOffset: number; snapshot: Mark[] } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fileName, setFileName] = useState(""), [tool, setTool] = useState<Tool>("rect"), [color, setColor] = useState(colors[0]);
  const [lineWidth, setLineWidth] = useState(5), [marks, setMarks] = useState<Mark[]>([]), [past, setPast] = useState<Mark[][]>([]), [future, setFuture] = useState<Mark[][]>([]);
  const [preview, setPreview] = useState<Mark | null>(null), [dragging, setDragging] = useState(false), [watermarkOpen, setWatermarkOpen] = useState(false), [watermarkPreview, setWatermarkPreview] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]), [selectionBox, setSelectionBox] = useState<{ start: Point; end: Point } | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [watermark, setWatermark] = useState("仅供展示"), [watermarkOpacity, setWatermarkOpacity] = useState(22), [watermarkSize, setWatermarkSize] = useState(34), [watermarkRotation, setWatermarkRotation] = useState(-25), [watermarkMode, setWatermarkMode] = useState<WatermarkMode>("tile"), [watermarkPosition, setWatermarkPosition] = useState<Point | null>(null);
  const [textRotation, setTextRotation] = useState(0);
  const [watermarkTab, setWatermarkTab] = useState<WatermarkTab>("text"), [savedWatermarks, setSavedWatermarks] = useState<SavedWatermark[]>([]), [presetsLoaded, setPresetsLoaded] = useState(false), [watermarkImage, setWatermarkImage] = useState<{ src: string; ratio: number; name: string } | null>(null), [watermarkImageSize, setWatermarkImageSize] = useState<{ width: number; height: number } | null>(null), [imageBlendMode, setImageBlendMode] = useState<ImageBlendMode>("source-over");
  const [presetStatus, setPresetStatus] = useState<"idle" | "saved" | "failed">("idle");
  const presetSavedTimer = useRef<number | null>(null);
  const watermarkEditSnapshot = useRef<Mark[] | null>(null);
  const [textValue, setTextValue] = useState("");
  const safeMarks = Array.isArray(marks) ? marks : [], safePast = Array.isArray(past) ? past : [], safeFuture = Array.isArray(future) ? future : [], safeSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];
  const selectedArrow = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && mark.tool === "arrow") : null;
  const selectedLineMark = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && mark.tool === "line") : null;
  const hasSelectedLine = safeMarks.some((mark) => safeSelectedIds.includes(mark.id) && (mark.tool === "line" || mark.tool === "arrow"));
  const selectedTextMark = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && mark.tool === "text") : null;
  const chooseTool = (nextTool: Tool) => { setTool(nextTool); setHoveredId(null); if (nextTool !== "select") { setWatermarkPreview(false); setSelectedId(null); setSelectedIds([]); setSelectionBox(null); } };
  const syncWatermarkEditor = (mark: Mark) => {
    if (mark.tool !== "watermark") return;
    setWatermarkOpen(true); setWatermarkPreview(false); setWatermarkOpacity(Math.round((mark.opacity ?? .22) * 100));
    if (mark.image) {
      const width = Math.abs(mark.end.x - mark.start.x), height = Math.max(1, Math.abs(mark.end.y - mark.start.y));
      setWatermarkTab("image"); setImageBlendMode(mark.blendMode ?? "source-over"); setWatermarkRotation(Math.round((mark.rotation ?? 0) * 180 / Math.PI)); setWatermarkImage({ src: mark.image, ratio: width / height, name: "当前图片水印" }); setWatermarkImageSize({ width, height });
    } else {
      const mode = mark.watermarkMode ?? "corner"; setWatermarkTab("text"); setWatermark(mark.text || "水印"); setWatermarkSize(mark.width); setWatermarkRotation(Math.round((mark.rotation ?? defaultTextRotation(mode)) * 180 / Math.PI)); setWatermarkMode(mode); setWatermarkPosition(mark.start);
    }
  };

  const drawMark = useCallback((ctx: CanvasRenderingContext2D, mark: Mark) => {
    const { start, end } = mark;
    ctx.save(); ctx.strokeStyle = mark.color; ctx.fillStyle = mark.color; ctx.lineWidth = mark.width; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (mark.tool === "rect") { if (mark.radius) { roundedRectPath(ctx, start, end, mark.radius); ctx.stroke(); } else ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y); }
    else if (mark.tool === "circle") {
      ctx.beginPath(); ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    else if (mark.tool === "highlight") { ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = .52; if (mark.radius) { roundedRectPath(ctx, start, end, mark.radius); ctx.fill(); } else ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y); }
    else if (mark.tool === "blur" || mark.tool === "blurCircle") {
      const image = imageRef.current;
      if (image) {
        ctx.save();
        const blurRadius = Math.max(2, mark.width * 2);
        const left = Math.min(start.x, end.x), top = Math.min(start.y, end.y), width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
        const sourceLeft = Math.max(0, Math.floor(left)), sourceTop = Math.max(0, Math.floor(top)), sourceRight = Math.min(size.width, Math.ceil(left + width)), sourceBottom = Math.min(size.height, Math.ceil(top + height)), sourceWidth = Math.max(1, sourceRight - sourceLeft), sourceHeight = Math.max(1, sourceBottom - sourceTop), pad = Math.ceil(blurRadius * 2);
        const key = `${sourceLeft}:${sourceTop}:${sourceWidth}:${sourceHeight}:${blurRadius}`;
        let cached = mark.id > 0 ? blurCache.current[mark.id] : undefined;
        if (!cached || cached.key !== key) {
          const buffer = document.createElement("canvas"); buffer.width = sourceWidth + pad * 2; buffer.height = sourceHeight + pad * 2;
          const bufferCtx = buffer.getContext("2d");
          if (!bufferCtx) { ctx.restore(); return; }
          const sample = document.createElement("canvas"); sample.width = 2; sample.height = 2;
          const sampleCtx = sample.getContext("2d");
          if (!sampleCtx) { ctx.restore(); return; }
          sampleCtx.drawImage(image, sourceLeft, sourceTop, 1, 1, 0, 0, 1, 1);
          sampleCtx.drawImage(image, sourceRight - 1, sourceTop, 1, 1, 1, 0, 1, 1);
          sampleCtx.drawImage(image, sourceLeft, sourceBottom - 1, 1, 1, 0, 1, 1, 1);
          sampleCtx.drawImage(image, sourceRight - 1, sourceBottom - 1, 1, 1, 1, 1, 1, 1);
          const edge = sampleCtx.getImageData(0, 0, 2, 2).data;
          const backgroundOffset = [0, 4, 8, 12].reduce((best, offset) => edge[offset] * .299 + edge[offset + 1] * .587 + edge[offset + 2] * .114 > edge[best] * .299 + edge[best + 1] * .587 + edge[best + 2] * .114 ? offset : best, 0);
          bufferCtx.fillStyle = `rgba(${edge[backgroundOffset]},${edge[backgroundOffset + 1]},${edge[backgroundOffset + 2]},${edge[backgroundOffset + 3] / 255})`;
          bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
          bufferCtx.drawImage(image, sourceLeft, sourceTop, sourceWidth, sourceHeight, pad, pad, sourceWidth, sourceHeight);
          const blurred = document.createElement("canvas"); blurred.width = buffer.width; blurred.height = buffer.height;
          const blurredCtx = blurred.getContext("2d");
          if (!blurredCtx) { ctx.restore(); return; }
          blurredCtx.filter = `blur(${blurRadius}px)`; blurredCtx.drawImage(buffer, 0, 0);
          cached = { key, canvas: blurred, x: sourceLeft - pad, y: sourceTop - pad };
          if (mark.id > 0) blurCache.current[mark.id] = cached;
        }
        ctx.beginPath();
        if (mark.tool === "blurCircle") ctx.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        else if (mark.radius) roundedRectPath(ctx, start, end, mark.radius); else ctx.rect(left, top, width, height);
        ctx.clip(); ctx.drawImage(cached.canvas, cached.x, cached.y);
        ctx.restore();
      }
    }
    else if (mark.tool === "line" || mark.tool === "arrow") {
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      if (mark.tool === "arrow") {
        const angle = Math.atan2(end.y - start.y, end.x - start.x), head = Math.max(18, mark.width * 4);
        ctx.beginPath(); ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y); ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6)); ctx.stroke();
      }
    } else if (mark.tool === "text") {
      const bounds = getTextBounds(mark), center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
      ctx.globalAlpha = mark.opacity ?? 1; ctx.font = `700 ${Math.max(12, mark.width * 7)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.translate(center.x, center.y); ctx.rotate(mark.rotation ?? 0); ctx.fillText(mark.text || "文字", 0, 0);
    } else {
      if (mark.image) {
        const image = watermarkImages.current[mark.image];
        if (image?.complete) { const width = end.x - start.x, height = end.y - start.y; ctx.globalAlpha = mark.opacity ?? 1; ctx.globalCompositeOperation = mark.blendMode ?? "source-over"; ctx.translate(start.x + width / 2, start.y + height / 2); ctx.rotate(mark.rotation ?? 0); ctx.drawImage(image, -width / 2, -height / 2, width, height); }
        ctx.restore(); return;
      }
      ctx.globalAlpha = mark.opacity ?? .22; ctx.font = `700 ${Math.max(12, mark.width || 34)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const mode = mark.watermarkMode ?? (mark.repeat ? "tile" : "corner"), rotation = mark.rotation ?? defaultTextRotation(mode);
      if (mode === "tile" || mode === "tileHorizontal" || mode === "tileVertical") {
        ctx.translate(start.x, start.y); ctx.rotate(rotation);
        const horizontal = mode !== "tileVertical", vertical = mode !== "tileHorizontal";
        const xStart = horizontal ? -size.width : 0, xEnd = horizontal ? size.width : 0, yStart = vertical ? -size.height : 0, yEnd = vertical ? size.height : 0;
        for (let y = yStart; y <= yEnd; y += 150) for (let x = xStart; x <= xEnd; x += 310) ctx.fillText(mark.text || "水印", x, y);
      } else { ctx.translate(start.x, start.y); ctx.rotate(rotation); ctx.fillText(mark.text || "水印", 0, 0); }
    }
    ctx.restore();
  }, [size]);

  const renderCanvas = useCallback((showSelection = true) => {
    const canvas = canvasRef.current, image = imageRef.current;
    if (!canvas || !image || !size.width) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height); ctx.drawImage(image, 0, 0, size.width, size.height);
    safeMarks.forEach((mark) => drawMark(ctx, mark)); if (preview) drawMark(ctx, preview);
    const selectedWatermark = safeMarks.find((mark) => mark.id === selectedId && mark.tool === "watermark");
    if (showSelection && watermarkTab === "text" && watermarkPreview && !selectedWatermark && watermark.trim()) drawMark(ctx, { id: -1, tool: "watermark", start: watermarkPosition ?? watermarkAnchor(watermarkMode, size.width, size.height), end: { x: 0, y: 0 }, color, width: watermarkSize, text: watermark.trim(), opacity: watermarkOpacity / 100, watermarkMode, rotation: watermarkRotation * Math.PI / 180 });
    if (showSelection && watermarkTab === "image" && watermarkPreview && !selectedWatermark && watermarkImage) {
      const { width, height, start } = imageWatermarkGeometry(size.width, size.height, watermarkImage.ratio, watermarkPosition, watermarkImageSize);
      drawMark(ctx, { id: -1, tool: "watermark", start, end: { x: start.x + width, y: start.y + height }, color, width: 1, image: watermarkImage.src, opacity: watermarkOpacity / 100, blendMode: imageBlendMode, rotation: watermarkRotation * Math.PI / 180 });
      if (tool === "select") {
        const corners = [{ x: start.x, y: start.y }, { x: start.x + width, y: start.y }, { x: start.x + width, y: start.y + height }, { x: start.x, y: start.y + height }], center = { x: start.x + width / 2, y: start.y + height / 2 };
        ctx.save(); ctx.strokeStyle = "#2774e6"; ctx.fillStyle = "white"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeRect(start.x, start.y, width, height); ctx.setLineDash([]);
        corners.forEach((corner, index) => { ctx.fillStyle = index === 2 ? "#ffd43b" : "white"; ctx.beginPath(); ctx.arc(corner.x, corner.y, index === 2 ? 8 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
        ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(corners[3].x, corners[3].y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(center.x, center.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#2774e6"; ctx.font = "700 18px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("↻", center.x, center.y + 1); ctx.restore();
      }
    }
    if (showSelection && tool === "select") safeMarks.filter((mark) => safeSelectedIds.includes(mark.id) && mark.id !== selectedId).forEach((mark) => {
      const bounds = getMarkBounds(mark); ctx.save(); ctx.strokeStyle = "#2774e6"; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top); ctx.restore();
    });
    const hovered = showSelection && tool === "select" && !dragging && hoveredId !== selectedId ? safeMarks.find((mark) => mark.id === hoveredId) : null;
    if (hovered) {
      ctx.save(); ctx.strokeStyle = "#2774e6"; ctx.fillStyle = "white"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      if (hovered.tool === "watermark" && !hovered.image) { ctx.strokeRect(8, 8, size.width - 16, size.height - 16); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(hovered.start.x, hovered.start.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else {
        const textBounds = hovered.tool === "text" ? getTextBounds(hovered) : null;
        const left = textBounds?.left ?? Math.min(hovered.start.x, hovered.end.x) - 8, top = textBounds?.top ?? Math.min(hovered.start.y, hovered.end.y) - 8;
        const right = textBounds?.right ?? Math.max(hovered.start.x, hovered.end.x) + 8, bottom = textBounds?.bottom ?? Math.max(hovered.start.y, hovered.end.y) + 8;
        const corners = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
        if (hovered.tool === "circle" || hovered.tool === "blurCircle") { ctx.beginPath(); ctx.ellipse((left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2, 0, 0, Math.PI * 2); ctx.stroke(); } else ctx.strokeRect(left, top, right - left, bottom - top);
        ctx.setLineDash([]); corners.forEach((point, index) => { const resize = (["rect", "circle", "highlight", "blur", "blurCircle", "text"].includes(hovered.tool) || (hovered.tool === "watermark" && !!hovered.image)) && index === 2, radius = ["rect", "highlight", "blur"].includes(hovered.tool) && index === 0, width = ["rect", "circle"].includes(hovered.tool) && index === 1; ctx.fillStyle = resize ? "#ffd43b" : width ? "#17a673" : radius ? "#2774e6" : "white"; ctx.beginPath(); ctx.arc(point.x, point.y, resize || radius || width ? 8 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
        if (hovered.tool === "blur" || hovered.tool === "blurCircle" || (hovered.tool === "watermark" && hovered.image)) { const point = corners[3]; ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(point.x, point.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        if (hovered.tool === "line" || hovered.tool === "arrow") [hovered.start, hovered.end].forEach((point) => { ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(point.x, point.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      }
      ctx.restore();
    }
    const selected = showSelection && tool === "select" ? safeMarks.find((mark) => mark.id === selectedId) : null;
    if (selected?.tool === "watermark" && !selected.image) {
      ctx.save(); ctx.strokeStyle = "#2774e6"; ctx.fillStyle = "white"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.strokeRect(16, 16, size.width - 32, size.height - 32); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(selected.start.x, selected.start.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); drawWatermarkDeleteHandle(ctx, watermarkDeletePoint(selected, size)); ctx.restore();
    }
    if (selected && (["rect", "circle", "highlight", "blur", "blurCircle", "line", "arrow", "text"].includes(selected.tool) || (selected.tool === "watermark" && selected.image))) {
      ctx.save(); ctx.strokeStyle = "#2774e6"; ctx.fillStyle = "white"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      let corners: Point[];
      if (selected.tool === "arrow") {
        const dx = selected.end.x - selected.start.x, dy = selected.end.y - selected.start.y, length = Math.hypot(dx, dy) || 1;
        const ux = dx / length, uy = dy / length, nx = -uy, ny = ux, pad = 24, over = 10;
        corners = [
          { x: selected.start.x - ux * over + nx * pad, y: selected.start.y - uy * over + ny * pad },
          { x: selected.end.x + ux * over + nx * pad, y: selected.end.y + uy * over + ny * pad },
          { x: selected.end.x + ux * over - nx * pad, y: selected.end.y + uy * over - ny * pad },
          { x: selected.start.x - ux * over - nx * pad, y: selected.start.y - uy * over - ny * pad },
        ];
        ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y); corners.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.closePath(); ctx.stroke();
      } else {
        const textBounds = selected.tool === "text" ? getTextBounds(selected) : null;
        const left = textBounds?.left ?? Math.min(selected.start.x, selected.end.x) - 8, top = textBounds?.top ?? Math.min(selected.start.y, selected.end.y) - 8;
        const right = textBounds?.right ?? Math.max(selected.start.x, selected.end.x) + 8, bottom = textBounds?.bottom ?? Math.max(selected.start.y, selected.end.y) + 8;
        corners = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
        if (selected.tool === "circle" || selected.tool === "blurCircle") { ctx.beginPath(); ctx.ellipse((left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
        else ctx.strokeRect(left, top, right - left, bottom - top);
      }
      ctx.setLineDash([]); corners.forEach((point, index) => { const resizeHandle = (selected.tool === "rect" || selected.tool === "circle" || selected.tool === "highlight" || selected.tool === "blur" || selected.tool === "blurCircle" || selected.tool === "text" || (selected.tool === "watermark" && !!selected.image)) && index === 2, cornerHandle = (selected.tool === "rect" || selected.tool === "highlight" || selected.tool === "blur") && index === 0, widthHandle = (selected.tool === "rect" || selected.tool === "circle") && index === 1, opacityHandle = selected.tool === "text" && index === 3; ctx.fillStyle = resizeHandle ? "#ffd43b" : widthHandle ? "#17a673" : cornerHandle ? "#2774e6" : "white"; ctx.beginPath(); ctx.arc(point.x, point.y, resizeHandle || cornerHandle || widthHandle || opacityHandle ? 8 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      if (selected.tool === "blur" || selected.tool === "blurCircle" || (selected.tool === "watermark" && selected.image)) { const point = corners[3]; ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(point.x, point.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      if (selected.tool === "line" || selected.tool === "arrow") [selected.start, selected.end].forEach((point) => { ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(point.x, point.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      if (selected.tool === "arrow") {
        const center = { x: (selected.start.x + selected.end.x) / 2, y: (selected.start.y + selected.end.y) / 2 };
        ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(center.x, center.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#2774e6"; ctx.font = "700 18px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("↻", center.x, center.y + 1);
      }
      if (selected.tool === "text") { const center = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 }; ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(center.x, center.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#2774e6"; ctx.font = "700 18px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("↻", center.x, center.y + 1); }
      if (selected.tool === "watermark" && selected.image) { const center = { x: (selected.start.x + selected.end.x) / 2, y: (selected.start.y + selected.end.y) / 2 }; ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(center.x, center.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#2774e6"; ctx.font = "700 18px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("↻", center.x, center.y + 1); }
      if (selected.tool === "watermark" && selected.image) drawWatermarkDeleteHandle(ctx, watermarkDeletePoint(selected, size));
      ctx.restore();
    }
    if (showSelection && tool === "select" && selectionBox) {
      const left = Math.min(selectionBox.start.x, selectionBox.end.x), top = Math.min(selectionBox.start.y, selectionBox.end.y);
      const right = Math.max(selectionBox.start.x, selectionBox.end.x), bottom = Math.max(selectionBox.start.y, selectionBox.end.y);
      ctx.save(); ctx.fillStyle = "#2774e61a"; ctx.strokeStyle = "#2774e6"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.fillRect(left, top, right - left, bottom - top); ctx.strokeRect(left, top, right - left, bottom - top); ctx.restore();
    }
  }, [safeMarks, safeSelectedIds, preview, size, selectedId, hoveredId, dragging, tool, selectionBox, drawMark, watermarkTab, watermarkPreview, watermark, watermarkMode, watermarkSize, watermarkRotation, watermarkOpacity, watermarkPosition, watermarkImage, watermarkImageSize, imageBlendMode, color]);

  useEffect(() => { renderCanvas(); }, [renderCanvas]);

  const getPoint = (event: PointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 }; const box = canvas.getBoundingClientRect(); if (!box.width || !box.height) return { x: 0, y: 0 };
    return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height };
  };
  const loadFile = useCallback((file?: File | null) => {
    if (!file?.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      imageRef.current = image; setSize({ width: Math.round(image.naturalWidth * scale), height: Math.round(image.naturalHeight * scale) });
      blurCache.current = {}; setFileName(file.name); setMarks([]); setPast([]); setFuture([]); setSelectedId(null); setSelectedIds([]); setSelectionBox(null); setWatermarkPosition(null); setWatermarkImageSize(null); widthSnapshot.current = null; cornerDragData.current = null; shapeResizeData.current = null; lineResizeData.current = null; URL.revokeObjectURL(url);
    };
    image.src = url;
  }, []);
  const commit = (mark: Mark) => { setMarks((items) => { const current = Array.isArray(items) ? items : []; setPast((history) => [...(Array.isArray(history) ? history : []), current]); return [...current, mark]; }); setFuture([]); };
  const findMovableMark = (point: Point) => {
    const hitMark = (mark: Mark) => {
      if (mark.tool === "watermark") return isWatermarkHit(point, mark, size.width, size.height);
      if (mark.tool === "line" || mark.tool === "arrow") return distanceToSegment(point, mark.start, mark.end) <= Math.max(14, mark.width * 2);
      if (mark.tool !== "rect" && mark.tool !== "circle" && mark.tool !== "highlight" && mark.tool !== "blur" && mark.tool !== "blurCircle" && mark.tool !== "text") return false;
      const bounds = getMarkBounds(mark); return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
    };
    return [...safeMarks].reverse().find(hitMark);
  };
  const startDrawing = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
    const point = getPoint(event);
    if (tool === "select") {
      const activeWatermark = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && mark.tool === "watermark") : null;
      if (activeWatermark && Math.hypot(point.x - watermarkDeletePoint(activeWatermark, size).x, point.y - watermarkDeletePoint(activeWatermark, size).y) <= 17) { deleteSelected(); return; }
      if (activeWatermark) syncWatermarkEditor(activeWatermark);
      const selectedText = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && mark.tool === "text") : null;
      if (selectedText) {
        const bounds = getTextBounds(selectedText);
        const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
        if (Math.hypot(point.x - bounds.left, point.y - bounds.bottom) <= 18) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; textOpacityData.current = { id: selectedText.id, origin: point, snapshot: safeMarks }; setDragging(true); return;
        }
        if (Math.hypot(point.x - center.x, point.y - center.y) <= 20) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point;
          textRotateData.current = { id: selectedText.id, center, angleOffset: Math.atan2(point.y - center.y, point.x - center.x) - (selectedText.rotation ?? 0), snapshot: safeMarks }; setDragging(true); return;
        }
        if (Math.hypot(point.x - bounds.right, point.y - bounds.bottom) <= 16) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point;
          resizeData.current = { id: selectedText.id, anchor: { x: bounds.left, y: bounds.top }, baseWidth: bounds.right - bounds.left, baseHeight: bounds.bottom - bounds.top, width: selectedText.width, snapshot: safeMarks };
          setDragging(true); return;
        }
      }
      const selectedShape = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && (mark.tool === "rect" || mark.tool === "circle" || mark.tool === "highlight" || mark.tool === "blur" || mark.tool === "blurCircle" || (mark.tool === "watermark" && mark.image))) : null;
      if (selectedShape) {
        const bounds = getMarkBounds(selectedShape), maxX = Math.max(selectedShape.start.x, selectedShape.end.x), maxY = Math.max(selectedShape.start.y, selectedShape.end.y);
        if ((selectedShape.tool === "rect" || selectedShape.tool === "highlight" || selectedShape.tool === "blur") && Math.hypot(point.x - Math.min(selectedShape.start.x, selectedShape.end.x), point.y - Math.min(selectedShape.start.y, selectedShape.end.y)) <= 18) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; cornerDragData.current = { id: selectedShape.id, origin: point, snapshot: safeMarks }; setDragging(true); return;
        }
        if ((selectedShape.tool === "rect" || selectedShape.tool === "circle") && Math.hypot(point.x - maxX, point.y - Math.min(selectedShape.start.y, selectedShape.end.y)) <= 18) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; shapeWidthData.current = { id: selectedShape.id, origin: point, snapshot: safeMarks }; setDragging(true); return;
        }
        if ((selectedShape.tool === "blur" || selectedShape.tool === "blurCircle") && Math.hypot(point.x - (Math.min(selectedShape.start.x, selectedShape.end.x) - 8), point.y - (maxY + 8)) <= 18) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; blurDragData.current = { id: selectedShape.id, origin: point, snapshot: safeMarks }; setDragging(true); return;
        }
        if (selectedShape.tool === "watermark" && selectedShape.image && Math.hypot(point.x - (Math.min(selectedShape.start.x, selectedShape.end.x) - 8), point.y - (maxY + 8)) <= 18) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; imageOpacityData.current = { id: selectedShape.id, origin: point, snapshot: safeMarks }; setDragging(true); return;
        }
        if (Math.hypot(point.x - bounds.right, point.y - bounds.bottom) <= 16) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point;
          shapeResizeData.current = { id: selectedShape.id, fixed: { x: Math.min(selectedShape.start.x, selectedShape.end.x), y: Math.min(selectedShape.start.y, selectedShape.end.y) }, offset: { x: point.x - maxX - 8, y: point.y - maxY - 8 }, snapshot: safeMarks };
          setDragging(true); return;
        }
      }
      const selectedLine = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && (mark.tool === "line" || mark.tool === "arrow")) : null;
      if (selectedLine) {
        const endpoint = Math.hypot(point.x - selectedLine.start.x, point.y - selectedLine.start.y) <= 16 ? "start" : Math.hypot(point.x - selectedLine.end.x, point.y - selectedLine.end.y) <= 16 ? "end" : null;
        if (endpoint) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; lineResizeData.current = { id: selectedLine.id, endpoint, snapshot: safeMarks }; setDragging(true); return;
        }
      }
      if (selectedArrow) {
        const center = { x: (selectedArrow.start.x + selectedArrow.end.x) / 2, y: (selectedArrow.start.y + selectedArrow.end.y) / 2 };
        if (Math.hypot(point.x - center.x, point.y - center.y) <= 20) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point;
          rotateData.current = { id: selectedArrow.id, center, length: Math.hypot(selectedArrow.end.x - selectedArrow.start.x, selectedArrow.end.y - selectedArrow.start.y), snapshot: safeMarks };
          setDragging(true); return;
        }
      }
      const selectedImage = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && mark.tool === "watermark" && mark.image) : null;
      if (selectedImage) {
        const center = { x: (selectedImage.start.x + selectedImage.end.x) / 2, y: (selectedImage.start.y + selectedImage.end.y) / 2 };
        if (Math.hypot(point.x - center.x, point.y - center.y) <= 20) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; imageRotateData.current = { id: selectedImage.id, center, angleOffset: Math.atan2(point.y - center.y, point.x - center.x) - (selectedImage.rotation ?? 0), snapshot: safeMarks }; setDragging(true); return;
        }
      }
      const selected = findMovableMark(point);
      if (selected) {
        const ids = safeSelectedIds.includes(selected.id) ? safeSelectedIds : [selected.id];
        setSelectedIds(ids); setSelectedId(selected.id); setColor(selected.color); if (selected.tool === "text") setTextRotation(Math.round((selected.rotation ?? 0) * 180 / Math.PI)); syncWatermarkEditor(selected); if (selected.tool !== "watermark" && selected.tool !== "blur" && selected.tool !== "blurCircle") setLineWidth(selected.width); event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; moveSnapshot.current = safeMarks; setDragging(true);
      } else if (watermarkPreview && ((watermarkTab === "text" && watermark.trim()) || (watermarkTab === "image" && watermarkImage))) {
        const imageDraft = watermarkTab === "image" && watermarkImage ? imageWatermarkGeometry(size.width, size.height, watermarkImage.ratio, watermarkPosition, watermarkImageSize) : null;
        if (imageDraft && watermarkImage) {
          const bottomRight = { x: imageDraft.start.x + imageDraft.width, y: imageDraft.start.y + imageDraft.height }, bottomLeft = { x: imageDraft.start.x, y: imageDraft.start.y + imageDraft.height }, center = { x: imageDraft.start.x + imageDraft.width / 2, y: imageDraft.start.y + imageDraft.height / 2 };
          if (Math.hypot(point.x - bottomRight.x, point.y - bottomRight.y) <= 18) { event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; watermarkDraftResize.current = { origin: point, size: { width: imageDraft.width, height: imageDraft.height } }; setDragging(true); return; }
          if (Math.hypot(point.x - bottomLeft.x, point.y - bottomLeft.y) <= 18) { event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; watermarkDraftOpacity.current = { origin: point, opacity: watermarkOpacity }; setDragging(true); return; }
          if (Math.hypot(point.x - center.x, point.y - center.y) <= 20) { event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; watermarkDraftRotate.current = { center, angleOffset: Math.atan2(point.y - center.y, point.x - center.x) - watermarkRotation * Math.PI / 180 }; setDragging(true); return; }
        }
        const draft = imageDraft && watermarkImage ? { id: -1, tool: "watermark" as const, start: imageDraft.start, end: { x: imageDraft.start.x + imageDraft.width, y: imageDraft.start.y + imageDraft.height }, color, width: 1, image: watermarkImage.src, opacity: watermarkOpacity / 100, blendMode: imageBlendMode, rotation: watermarkRotation * Math.PI / 180 } : { id: -1, tool: "watermark" as const, start: watermarkPosition ?? watermarkAnchor(watermarkMode, size.width, size.height), end: { x: 0, y: 0 }, color, width: watermarkSize, text: watermark.trim(), opacity: watermarkOpacity / 100, watermarkMode, rotation: watermarkRotation * Math.PI / 180 };
        if (isWatermarkHit(point, draft, size.width, size.height)) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; watermarkDrag.current = { start: point, origin: draft.start }; setDragging(true); return;
        }
        setSelectedIds([]); setSelectedId(null); event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; setSelectionBox({ start: point, end: point }); setDragging(true);
      } else {
        setSelectedIds([]); setSelectedId(null); event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; setSelectionBox({ start: point, end: point }); setDragging(true);
      }
      return;
    }
    if (tool === "text") { if (textValue.trim()) commit({ id: nextId.current++, tool, start: point, end: point, color, width: lineWidth, text: textValue.trim() }); return; }
    event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; setDragging(true); setPreview({ id: 0, tool, start: point, end: point, color, width: lineWidth });
  };
  const moveDrawing = (event: PointerEvent<HTMLElement>) => {
    const point = getPoint(event);
    if (!dragStart.current) {
      if (tool === "select") { const hovered = findMovableMark(point); setHoveredId((id) => id === (hovered?.id ?? null) ? id : hovered?.id ?? null); }
      return;
    }
    if ((tool === "line" || tool === "arrow") && event.shiftKey) Object.assign(point, snapLineAngle(dragStart.current, point));
    if ((tool === "circle" || tool === "blurCircle" || tool === "rect" || tool === "highlight") && event.shiftKey) Object.assign(point, constrainSquare(dragStart.current, point));
    if (tool === "select" && watermarkDrag.current) {
      const { start, origin } = watermarkDrag.current;
      setWatermarkPosition({ x: origin.x + point.x - start.x, y: origin.y + point.y - start.y });
    } else if (tool === "select" && watermarkDraftResize.current && watermarkImage) {
      const { origin, size: base } = watermarkDraftResize.current, width = Math.max(32, base.width + point.x - origin.x);
      setWatermarkImageSize({ width, height: width / watermarkImage.ratio });
    } else if (tool === "select" && watermarkDraftOpacity.current) {
      const { origin, opacity } = watermarkDraftOpacity.current;
      setWatermarkOpacity(Math.max(8, Math.min(100, opacity + ((origin.x - point.x) + (point.y - origin.y)) / 2.2)));
    } else if (tool === "select" && watermarkDraftRotate.current) {
      const { center, angleOffset } = watermarkDraftRotate.current;
      if (Math.hypot(point.x - center.x, point.y - center.y) > 3) setWatermarkRotation(Math.round((Math.atan2(point.y - center.y, point.x - center.x) - angleOffset) * 180 / Math.PI));
    } else if (tool === "select" && cornerDragData.current) {
      const { id, origin, snapshot } = cornerDragData.current, base = snapshot.find((mark) => mark.id === id)?.radius ?? 0;
      const radius = Math.max(0, Math.min(80, base + ((point.x - origin.x) + (point.y - origin.y)) / 2));
      setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, radius } : mark));
    } else if (tool === "select" && shapeWidthData.current) {
      const { id, origin, snapshot } = shapeWidthData.current, base = snapshot.find((mark) => mark.id === id)?.width ?? 5;
      const width = Math.max(2, Math.min(14, base + ((point.x - origin.x) + (origin.y - point.y)) / 12));
      setLineWidth(width); setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, width } : mark));
    } else if (tool === "select" && blurDragData.current) {
      const { id, origin, snapshot } = blurDragData.current, base = snapshot.find((mark) => mark.id === id)?.width ?? 5;
      const width = Math.max(2, Math.min(14, base + ((origin.x - point.x) + (point.y - origin.y)) / 8));
      setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, width } : mark));
    } else if (tool === "select" && imageOpacityData.current) {
      const { id, origin, snapshot } = imageOpacityData.current, base = snapshot.find((mark) => mark.id === id)?.opacity ?? .22;
      const opacity = Math.max(.08, Math.min(1, base + ((origin.x - point.x) + (point.y - origin.y)) / 220));
      setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, opacity } : mark));
    } else if (tool === "select" && textOpacityData.current) {
      const { id, origin, snapshot } = textOpacityData.current, base = snapshot.find((mark) => mark.id === id)?.opacity ?? 1;
      const opacity = Math.max(.08, Math.min(1, base + ((origin.x - point.x) + (point.y - origin.y)) / 220));
      setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, opacity } : mark));
    } else if (tool === "select" && lineResizeData.current) {
      const { id, endpoint, snapshot } = lineResizeData.current;
      setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, [endpoint]: point } : mark));
    } else if (tool === "select" && textRotateData.current) {
      const { center, angleOffset, id, snapshot } = textRotateData.current;
      const rotation = Math.atan2(point.y - center.y, point.x - center.x) - angleOffset;
      if (Math.hypot(point.x - center.x, point.y - center.y) > 3) { setTextRotation(Math.round(rotation * 180 / Math.PI)); setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, rotation } : mark)); }
    } else if (tool === "select" && rotateData.current) {
      const { center, length, id, snapshot } = rotateData.current, angle = Math.atan2(point.y - center.y, point.x - center.x), half = length / 2;
      if (Math.hypot(point.x - center.x, point.y - center.y) > 3) setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, start: { x: center.x - Math.cos(angle) * half, y: center.y - Math.sin(angle) * half }, end: { x: center.x + Math.cos(angle) * half, y: center.y + Math.sin(angle) * half } } : mark));
    } else if (tool === "select" && imageRotateData.current) {
      const { center, angleOffset, id, snapshot } = imageRotateData.current;
      const rotation = Math.atan2(point.y - center.y, point.x - center.x) - angleOffset;
      if (Math.hypot(point.x - center.x, point.y - center.y) > 3) setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, rotation } : mark));
    } else if (tool === "select" && shapeResizeData.current) {
      const { fixed, offset, id, snapshot } = shapeResizeData.current;
      let end = { x: point.x - offset.x - 8, y: point.y - offset.y - 8 };
      const original = snapshot.find((mark) => mark.id === id);
      if (event.shiftKey && original) {
        const width = Math.max(1, Math.abs(original.end.x - original.start.x)), height = Math.max(1, Math.abs(original.end.y - original.start.y));
        const scale = Math.max(Math.abs(end.x - fixed.x) / width, Math.abs(end.y - fixed.y) / height);
        end = { x: fixed.x + Math.sign(end.x - fixed.x || 1) * width * scale, y: fixed.y + Math.sign(end.y - fixed.y || 1) * height * scale };
      }
      setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, start: fixed, end } : mark));
    } else if (tool === "select" && resizeData.current) {
      const { anchor, baseWidth, baseHeight, id, width, snapshot } = resizeData.current;
      const ratio = Math.max(.25, Math.hypot(point.x - anchor.x, point.y - anchor.y) / Math.hypot(baseWidth, baseHeight));
      setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, width: width * ratio } : mark));
    } else if (tool === "select" && safeSelectedIds.length && moveSnapshot.current) {
      const dx = point.x - dragStart.current.x, dy = point.y - dragStart.current.y;
      setMarks(moveSnapshot.current.map((mark) => safeSelectedIds.includes(mark.id) ? { ...mark, start: { x: mark.start.x + dx, y: mark.start.y + dy }, end: { x: mark.end.x + dx, y: mark.end.y + dy } } : mark));
    } else if (tool === "select" && selectionBox) {
      setSelectionBox({ start: selectionBox.start, end: point });
    } else if (tool !== "select") setPreview({ id: 0, tool, start: dragStart.current, end: point, color, width: lineWidth });
  };
  const finishDrawing = (event: PointerEvent<HTMLElement>) => {
    if (!dragStart.current) return; const end = getPoint(event), start = dragStart.current;
    if ((tool === "line" || tool === "arrow") && event.shiftKey) Object.assign(end, snapLineAngle(start, end));
    if ((tool === "circle" || tool === "blurCircle" || tool === "rect" || tool === "highlight") && event.shiftKey) Object.assign(end, constrainSquare(start, end));
    if (tool === "select") {
      const watermarkMoving = watermarkDrag.current, cornerResizing = cornerDragData.current, widthAdjusting = shapeWidthData.current, blurAdjusting = blurDragData.current, imageOpacityAdjusting = imageOpacityData.current, textOpacityAdjusting = textOpacityData.current, lineResizing = lineResizeData.current, rotation = rotateData.current, textRotation = textRotateData.current, imageRotation = imageRotateData.current, shapeResizing = shapeResizeData.current, resizing = resizeData.current, movement = moveSnapshot.current, marquee = selectionBox;
      if (!watermarkMoving && cornerResizing && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = cornerResizing.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && widthAdjusting && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = widthAdjusting.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && blurAdjusting && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = blurAdjusting.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && imageOpacityAdjusting && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = imageOpacityAdjusting.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && textOpacityAdjusting && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = textOpacityAdjusting.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && lineResizing && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = lineResizing.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && rotation && Math.hypot(end.x - rotation.center.x, end.y - rotation.center.y) > 3) { const snapshot = rotation.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && textRotation && Math.hypot(end.x - textRotation.center.x, end.y - textRotation.center.y) > 3) { const snapshot = textRotation.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && imageRotation && Math.hypot(end.x - imageRotation.center.x, end.y - imageRotation.center.y) > 3) { const snapshot = imageRotation.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && shapeResizing && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = shapeResizing.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && resizing && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = resizing.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && movement && Math.hypot(end.x - start.x, end.y - start.y) > 1) { setPast((history) => [...(Array.isArray(history) ? history : []), movement]); setFuture([]); }
      else if (!watermarkMoving && marquee) {
        const left = Math.min(marquee.start.x, marquee.end.x), top = Math.min(marquee.start.y, marquee.end.y), right = Math.max(marquee.start.x, marquee.end.x), bottom = Math.max(marquee.start.y, marquee.end.y);
        const ids = safeMarks.filter((mark) => { const bounds = getMarkBounds(mark); return bounds.left <= right && bounds.right >= left && bounds.top <= bottom && bounds.bottom >= top; }).map((mark) => mark.id);
        setSelectedIds(ids); setSelectedId(ids[0] ?? null);
      }
      moveSnapshot.current = null; rotateData.current = null; textRotateData.current = null; imageRotateData.current = null; imageOpacityData.current = null; textOpacityData.current = null; cornerDragData.current = null; shapeWidthData.current = null; blurDragData.current = null; shapeResizeData.current = null; lineResizeData.current = null; resizeData.current = null; watermarkDrag.current = null; watermarkDraftResize.current = null; watermarkDraftOpacity.current = null; watermarkDraftRotate.current = null; watermarkEditSnapshot.current = null;
      setSelectionBox(null);
    } else if (Math.hypot(end.x - start.x, end.y - start.y) > 5) commit({ id: nextId.current++, tool, start, end, color, width: lineWidth });
    dragStart.current = null; setDragging(false); setPreview(null);
  };
  const undo = useCallback(() => setPast((history) => {
    const entries = Array.isArray(history) ? history : []; if (!entries.length) return entries;
    const previous = entries.at(-1)!; setMarks((current) => { setFuture((items) => [...(Array.isArray(items) ? items : []), Array.isArray(current) ? current : []]); return previous; }); setSelectedId(null); setSelectedIds([]); widthSnapshot.current = null; return entries.slice(0, -1);
  }), []);
  const redoLast = useCallback(() => setFuture((items) => {
    const entries = Array.isArray(items) ? items : []; if (!entries.length) return entries;
    const next = entries.at(-1)!; setMarks((current) => { setPast((history) => [...(Array.isArray(history) ? history : []), Array.isArray(current) ? current : []]); return next; }); setSelectedId(null); setSelectedIds([]); widthSnapshot.current = null; return entries.slice(0, -1);
  }), []);
  const deleteSelected = useCallback(() => {
    const ids = safeSelectedIds.length ? safeSelectedIds : selectedId === null ? [] : [selectedId];
    if (!ids.length) return;
    setMarks((items) => {
      const current = Array.isArray(items) ? items : [];
      if (!current.some((mark) => ids.includes(mark.id))) return current;
      setPast((history) => [...(Array.isArray(history) ? history : []), current]); setFuture([]);
      return current.filter((mark) => !ids.includes(mark.id));
    });
    setSelectedId(null); setSelectedIds([]);
  }, [safeSelectedIds, selectedId]);
  const changeColor = (nextColor: string) => {
    setColor(nextColor);
    const ids = safeSelectedIds.length ? safeSelectedIds : selectedId === null ? [] : [selectedId];
    if (!ids.length) return;
    setMarks((items) => {
      const current = Array.isArray(items) ? items : [], selected = current.filter((mark) => ids.includes(mark.id));
      if (!selected.length || selected.every((mark) => mark.color === nextColor)) return current;
      setPast((history) => [...(Array.isArray(history) ? history : []), current]); setFuture([]);
      return current.map((mark) => ids.includes(mark.id) ? { ...mark, color: nextColor } : mark);
    });
  };
  const changeWidth = (nextWidth: number) => {
    setLineWidth(nextWidth);
    const ids = safeSelectedIds.length ? safeSelectedIds : selectedId === null ? [] : [selectedId];
    if (!ids.length) return;
    setMarks((items) => {
      const current = Array.isArray(items) ? items : [], selected = current.filter((mark) => ids.includes(mark.id) && (mark.tool === "line" || mark.tool === "arrow"));
      if (!selected.length || selected.every((mark) => mark.width === nextWidth)) return current;
      if (!widthSnapshot.current) { widthSnapshot.current = current; setPast((history) => [...(Array.isArray(history) ? history : []), current]); setFuture([]); }
      return current.map((mark) => ids.includes(mark.id) && (mark.tool === "line" || mark.tool === "arrow") ? { ...mark, width: nextWidth } : mark);
    });
  };
  const changeTextRotation = (nextRotation: number) => {
    setTextRotation(nextRotation);
    const ids = safeSelectedIds.length ? safeSelectedIds : selectedId === null ? [] : [selectedId];
    if (!ids.length) return;
    setMarks((items) => {
      const current = Array.isArray(items) ? items : [], selected = current.filter((mark) => ids.includes(mark.id) && mark.tool === "text");
      if (!selected.length || selected.every((mark) => (mark.rotation ?? 0) === nextRotation * Math.PI / 180)) return current;
      if (!watermarkEditSnapshot.current) { watermarkEditSnapshot.current = current; setPast((history) => [...(Array.isArray(history) ? history : []), current]); setFuture([]); }
      return current.map((mark) => ids.includes(mark.id) && mark.tool === "text" ? { ...mark, rotation: nextRotation * Math.PI / 180 } : mark);
    });
  };
  const changeImageOpacity = (nextOpacity: number) => {
    setWatermarkOpacity(nextOpacity);
    const ids = safeSelectedIds.length ? safeSelectedIds : selectedId === null ? [] : [selectedId];
    if (!ids.length) return;
    setMarks((items) => {
      const current = Array.isArray(items) ? items : [], selected = current.filter((mark) => ids.includes(mark.id) && mark.tool === "watermark" && mark.image);
      if (!selected.length || selected.every((mark) => mark.opacity === nextOpacity / 100)) return current;
      if (!watermarkEditSnapshot.current) { watermarkEditSnapshot.current = current; setPast((history) => [...(Array.isArray(history) ? history : []), current]); setFuture([]); }
      return current.map((mark) => ids.includes(mark.id) && mark.tool === "watermark" && mark.image ? { ...mark, opacity: nextOpacity / 100 } : mark);
    });
  };
  const changeImageBlendMode = (nextBlendMode: ImageBlendMode) => {
    setImageBlendMode(nextBlendMode);
    const ids = safeSelectedIds.length ? safeSelectedIds : selectedId === null ? [] : [selectedId];
    if (!ids.length) return;
    setMarks((items) => {
      const current = Array.isArray(items) ? items : [], selected = current.filter((mark) => ids.includes(mark.id) && mark.tool === "watermark" && mark.image);
      if (!selected.length || selected.every((mark) => (mark.blendMode ?? "source-over") === nextBlendMode)) return current;
      setPast((history) => [...(Array.isArray(history) ? history : []), current]); setFuture([]);
      return current.map((mark) => ids.includes(mark.id) && mark.tool === "watermark" && mark.image ? { ...mark, blendMode: nextBlendMode } : mark);
    });
  };
  const changeImageRotation = (nextRotation: number) => {
    setWatermarkRotation(nextRotation);
    const ids = safeSelectedIds.length ? safeSelectedIds : selectedId === null ? [] : [selectedId];
    if (!ids.length) return;
    setMarks((items) => {
      const current = Array.isArray(items) ? items : [], selected = current.filter((mark) => ids.includes(mark.id) && mark.tool === "watermark" && mark.image);
      if (!selected.length || selected.every((mark) => (mark.rotation ?? 0) === nextRotation * Math.PI / 180)) return current;
      if (!watermarkEditSnapshot.current) { watermarkEditSnapshot.current = current; setPast((history) => [...(Array.isArray(history) ? history : []), current]); setFuture([]); }
      return current.map((mark) => ids.includes(mark.id) && mark.tool === "watermark" && mark.image ? { ...mark, rotation: nextRotation * Math.PI / 180 } : mark);
    });
  };
  const changeTextWatermark = (updates: Partial<Mark>, continuous = false) => {
    const ids = safeSelectedIds.length ? safeSelectedIds : selectedId === null ? [] : [selectedId];
    if (!ids.length) return;
    setMarks((items) => {
      const current = Array.isArray(items) ? items : [], selected = current.filter((mark) => ids.includes(mark.id) && mark.tool === "watermark" && !mark.image);
      if (!selected.length) return current;
      if (!continuous || !watermarkEditSnapshot.current) { if (continuous) watermarkEditSnapshot.current = current; setPast((history) => [...(Array.isArray(history) ? history : []), current]); setFuture([]); }
      return current.map((mark) => ids.includes(mark.id) && mark.tool === "watermark" && !mark.image ? { ...mark, ...updates } : mark);
    });
  };
  const addWatermark = () => {
    if (!watermark.trim() || !imageRef.current) return;
    const start = watermarkPosition ?? watermarkAnchor(watermarkMode, size.width, size.height);
    commit({ id: nextId.current++, tool: "watermark", start, end: { x: 0, y: 0 }, color, width: watermarkSize, text: watermark.trim(), opacity: watermarkOpacity / 100, watermarkMode, rotation: watermarkRotation * Math.PI / 180 }); setWatermarkPreview(false);
  };
  const saveWatermarkPreset = () => {
    if (!watermark.trim()) return;
    setSavedWatermarks((items) => [...items.filter((item) => item.text !== watermark.trim()), { id: Date.now(), text: watermark.trim(), color, width: watermarkSize, opacity: watermarkOpacity, watermarkMode, rotation: watermarkRotation * Math.PI / 180 }]);
    setPresetStatus("saved"); if (presetSavedTimer.current) window.clearTimeout(presetSavedTimer.current); presetSavedTimer.current = window.setTimeout(() => setPresetStatus("idle"), 1400);
  };
  const addSavedWatermark = (preset: SavedWatermark) => {
    if (!imageRef.current) return;
    setWatermarkPreview(false);
    if (preset.image) {
      const width = preset.imageWidth ?? Math.min(220, size.width * .35), height = preset.imageHeight ?? width, start = { x: Math.max(16, size.width - width - 28), y: Math.max(16, size.height - height - 28) };
      const add = () => { const id = nextId.current++; commit({ id, tool: "watermark", start, end: { x: start.x + width, y: start.y + height }, color: preset.color, width: 1, image: preset.image, opacity: preset.opacity / 100, blendMode: preset.blendMode ?? "source-over", rotation: preset.rotation }); setSelectedId(id); setSelectedIds([id]); setWatermarkTab("image"); setWatermarkOpacity(preset.opacity); setImageBlendMode(preset.blendMode ?? "source-over"); };
      if (watermarkImages.current[preset.image]?.complete) add(); else { const image = new Image(); image.onload = () => { watermarkImages.current[preset.image!] = image; add(); }; image.src = preset.image; }
      return;
    }
    const start = watermarkAnchor(preset.watermarkMode, size.width, size.height);
    const id = nextId.current++; commit({ id, tool: "watermark", start, end: { x: 0, y: 0 }, color: preset.color, width: preset.width, text: preset.text || "水印", opacity: preset.opacity / 100, watermarkMode: preset.watermarkMode, rotation: preset.rotation }); setSelectedId(id); setSelectedIds([id]); setWatermarkTab("text"); setWatermark(preset.text || "水印"); setWatermarkOpacity(preset.opacity); setWatermarkSize(preset.width); setWatermarkRotation(Math.round((preset.rotation ?? defaultTextRotation(preset.watermarkMode)) * 180 / Math.PI)); setWatermarkMode(preset.watermarkMode); setWatermarkPosition(start);
  };
  const loadWatermarkImage = (file?: File | null) => {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => { const src = String(reader.result), image = new Image(); image.onload = () => { const ratio = image.naturalWidth / Math.max(1, image.naturalHeight), geometry = imageWatermarkGeometry(size.width, size.height, ratio); watermarkImages.current[src] = image; setWatermarkImage({ src, ratio, name: file.name }); setWatermarkImageSize({ width: geometry.width, height: geometry.height }); setWatermarkPosition(geometry.start); setSelectedId(null); setSelectedIds([]); setTool("select"); setWatermarkPreview(true); }; image.src = src; };
    reader.readAsDataURL(file);
  };
  const addImageWatermark = () => {
    if (!watermarkImage || !imageRef.current) return;
    const { width, height, start } = imageWatermarkGeometry(size.width, size.height, watermarkImage.ratio, watermarkPosition, watermarkImageSize);
    const id = nextId.current++; commit({ id, tool: "watermark", start, end: { x: start.x + width, y: start.y + height }, color, width: 1, image: watermarkImage.src, opacity: watermarkOpacity / 100, blendMode: imageBlendMode, rotation: watermarkRotation * Math.PI / 180 }); setSelectedId(id); setSelectedIds([id]); setWatermarkPreview(false);
  };
  const saveImageWatermarkPreset = () => {
    const ids = safeSelectedIds.length ? safeSelectedIds : selectedId === null ? [] : [selectedId];
    const selected = safeMarks.find((mark) => ids.includes(mark.id) && mark.tool === "watermark" && mark.image);
    const image = selected?.image ?? watermarkImage?.src;
    if (!image) return;
    const width = selected ? Math.abs(selected.end.x - selected.start.x) : Math.min(220, size.width * .35), height = selected ? Math.abs(selected.end.y - selected.start.y) : width / (watermarkImage?.ratio ?? 1);
    setSavedWatermarks((items) => [...items, { id: Date.now(), image, imageWidth: width, imageHeight: height, rotation: selected?.rotation, blendMode: selected?.blendMode ?? imageBlendMode, color: selected?.color ?? color, width: 1, opacity: Math.round((selected?.opacity ?? watermarkOpacity / 100) * 100), watermarkMode }]);
    setPresetStatus("saved"); if (presetSavedTimer.current) window.clearTimeout(presetSavedTimer.current); presetSavedTimer.current = window.setTimeout(() => setPresetStatus("idle"), 1400);
  };
  const deleteSavedWatermark = (id: number) => setSavedWatermarks((items) => items.filter((item) => item.id !== id));
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem("image-marker-watermarks") || "[]"); if (Array.isArray(saved)) setSavedWatermarks(saved); } catch {} setPresetsLoaded(true); }, []);
  useEffect(() => { if (presetsLoaded) try { localStorage.setItem("image-marker-watermarks", JSON.stringify(savedWatermarks)); } catch { setPresetStatus("failed"); if (presetSavedTimer.current) window.clearTimeout(presetSavedTimer.current); presetSavedTimer.current = window.setTimeout(() => setPresetStatus("idle"), 2200); } }, [presetsLoaded, savedWatermarks]);
  useEffect(() => () => { if (presetSavedTimer.current) window.clearTimeout(presetSavedTimer.current); }, []);
  const download = () => {
    const canvas = canvasRef.current; if (!canvas) return; renderCanvas(false); const link = document.createElement("a");
    link.download = `${fileName.replace(/\.[^.]+$/, "") || "标注图片"}-marked.png`; link.href = canvas.toDataURL("image/png"); link.click();
    renderCanvas(true);
  };
  useEffect(() => {
    const paste = (event: ClipboardEvent) => loadFile([...event.clipboardData.items].find((item) => item.type.startsWith("image/"))?.getAsFile());
    window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste);
  }, [loadFile]);
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if ((event.key === "Delete" || event.key === "Backspace") && (safeSelectedIds.length || selectedId !== null)) { event.preventDefault(); deleteSelected(); return; }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const nextTool = tools.find((item) => item.shortcut.toLowerCase() === event.key.toLowerCase());
        if (nextTool) { event.preventDefault(); chooseTool(nextTool.id); (document.activeElement as HTMLElement | null)?.blur(); return; }
      }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault(); event.shiftKey ? redoLast() : undo();
    };
    window.addEventListener("keydown", shortcuts); return () => window.removeEventListener("keydown", shortcuts);
  }, [undo, redoLast, deleteSelected, safeSelectedIds, selectedId]);

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">↗</span><strong>标一下</strong><em>轻量图片标注</em></div>
      <div className="top-actions"><div className="history-actions"><button onClick={undo} disabled={!safePast.length} aria-label="撤销"><span>撤销</span><kbd>⌘Z</kbd></button><button onClick={redoLast} disabled={!safeFuture.length} aria-label="重做"><span>重做</span><kbd>⇧⌘Z</kbd></button></div><button className="delete-button" onClick={deleteSelected} disabled={selectedId === null && !safeSelectedIds.length} title="删除选中的标注"><span>删除</span><kbd>⌫</kbd></button><a className="github-button" href="https://github.com/kilou123e/image-marker" target="_blank" rel="noreferrer">GitHub ↗</a><button className="download-button" onClick={download} disabled={!size.width}>下载图片 <span>↓</span></button></div>
    </header>
    <section className="toolbar" aria-label="标注工具栏">
      <div className="tool-area"><div className="tool-group">{tools.map((item) => <button key={item.id} className={`tool-button ${tool === item.id ? "active" : ""}`} onClick={() => chooseTool(item.id)} aria-pressed={tool === item.id}><ToolIcon icon={item.icon} /><span className="tool-label">{item.label}</span></button>)}</div><div className="shortcut-row" aria-label="工具快捷键">{tools.map((item) => <kbd key={item.id} className={tool === item.id ? "active" : ""}>{item.shortcut}</kbd>)}</div></div>
      {tool === "text" && <label className="text-entry">文字<input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="输入后点击图片" autoFocus /></label>}
      <div className="divider" />
      <div className="colors" aria-label="颜色">{colors.map((item) => <button key={item} className={color === item ? "selected" : ""} style={{ background: item }} onClick={() => changeColor(item)} aria-label={`选择颜色 ${item}`} />)}<label className="custom-color" title="自定义颜色"><input type="color" value={color} onChange={(e: ChangeEvent<HTMLInputElement>) => changeColor(e.target.value)} /><span>＋</span></label></div>
      {(tool === "arrow" || tool === "line" || selectedArrow || selectedLineMark || hasSelectedLine) && <label className="width-control">粗细<input type="range" min="2" max="14" value={lineWidth} onChange={(e) => changeWidth(Number(e.target.value))} onPointerDown={() => { widthSnapshot.current = null; }} onPointerUp={() => { widthSnapshot.current = null; }} onBlur={() => { widthSnapshot.current = null; }} /></label>}
      {selectedTextMark && <label className="width-control text-rotation-control">文字旋转<input type="range" min="-180" max="180" value={textRotation} onPointerDown={() => { watermarkEditSnapshot.current = null; }} onPointerUp={() => { watermarkEditSnapshot.current = null; }} onChange={(e) => changeTextRotation(Number(e.target.value))} /><input className="watermark-number" type="number" min="-180" max="180" value={textRotation} onChange={(e) => changeTextRotation(Math.max(-180, Math.min(180, Number(e.target.value) || 0)))} />°</label>}
      <button className={`watermark-button ${watermarkOpen ? "active" : ""}`} onClick={() => { const next = !watermarkOpen; if (next) chooseTool("select"); if (next && size.width && !watermarkPosition) setWatermarkPosition(watermarkAnchor(watermarkMode, size.width, size.height)); setWatermarkOpen(next); setWatermarkPreview(next && (watermarkTab === "text" || !!watermarkImage)); }}>添加水印</button>
    </section>
    {watermarkOpen && <section className="watermark-panel">
      <div className="watermark-tabs"><button className={watermarkTab === "text" ? "active" : ""} onClick={() => { setWatermarkTab("text"); setWatermarkPreview(selectedId === null); }}>文字水印</button><button className={watermarkTab === "image" ? "active" : ""} onClick={() => { setWatermarkTab("image"); setWatermarkPreview(selectedId === null && !!watermarkImage); }}>图片水印</button><button className={watermarkTab === "saved" ? "active" : ""} onClick={() => { setWatermarkTab("saved"); setWatermarkPreview(false); }}>常用水印</button></div>
      {watermarkTab === "text" && <div className="watermark-content"><input className="watermark-text-input" value={watermark} onFocus={() => { watermarkEditSnapshot.current = null; }} onBlur={() => { watermarkEditSnapshot.current = null; }} onChange={(e) => { setWatermark(e.target.value); changeTextWatermark({ text: e.target.value }, true); }} placeholder="输入水印文字" autoFocus /><label className="opacity">透明度<input type="range" min="8" max="70" value={watermarkOpacity} onPointerDown={() => { watermarkEditSnapshot.current = null; }} onPointerUp={() => { watermarkEditSnapshot.current = null; }} onBlur={() => { watermarkEditSnapshot.current = null; }} onChange={(e) => { const opacity = Number(e.target.value); setWatermarkOpacity(opacity); changeTextWatermark({ opacity: opacity / 100 }, true); }} /><input className="watermark-number" type="number" min="8" max="70" value={watermarkOpacity} onChange={(e) => { const opacity = Math.max(8, Math.min(70, Number(e.target.value) || 8)); setWatermarkOpacity(opacity); changeTextWatermark({ opacity: opacity / 100 }, true); }} />%</label><label className="opacity">大小<input type="range" min="16" max="96" value={watermarkSize} onPointerDown={() => { watermarkEditSnapshot.current = null; }} onPointerUp={() => { watermarkEditSnapshot.current = null; }} onBlur={() => { watermarkEditSnapshot.current = null; }} onChange={(e) => { const width = Number(e.target.value); setWatermarkSize(width); changeTextWatermark({ width }, true); }} /><input className="watermark-number" type="number" min="16" max="96" value={watermarkSize} onChange={(e) => { const width = Math.max(16, Math.min(96, Number(e.target.value) || 16)); setWatermarkSize(width); changeTextWatermark({ width }, true); }} />px</label><label className="opacity">旋转<input type="range" min="-180" max="180" value={watermarkRotation} onPointerDown={() => { watermarkEditSnapshot.current = null; }} onPointerUp={() => { watermarkEditSnapshot.current = null; }} onBlur={() => { watermarkEditSnapshot.current = null; }} onChange={(e) => { const rotation = Number(e.target.value); setWatermarkRotation(rotation); changeTextWatermark({ rotation: rotation * Math.PI / 180 }, true); }} /><input className="watermark-number" type="number" min="-180" max="180" value={watermarkRotation} onChange={(e) => { const rotation = Math.max(-180, Math.min(180, Number(e.target.value) || 0)); setWatermarkRotation(rotation); changeTextWatermark({ rotation: rotation * Math.PI / 180 }, true); }} />°</label><label className="mode">展示方式<select value={watermarkMode} onChange={(e) => { const next = e.target.value as WatermarkMode; setWatermarkMode(next); changeTextWatermark({ watermarkMode: next }); if (size.width && selectedId === null) setWatermarkPosition(watermarkAnchor(next, size.width, size.height)); }}><option value="corner">右下角</option><option value="center">居中</option><option value="diagonal">斜向居中</option><option value="tile">平铺（横竖）</option><option value="tileHorizontal">水平平铺</option><option value="tileVertical">垂直平铺</option></select></label><button className="secondary" onClick={saveWatermarkPreset}>{presetStatus === "saved" ? "已保存 ✓" : presetStatus === "failed" ? "保存失败" : "存为常用"}</button><button onClick={addWatermark}>确认添加</button></div>}
      {watermarkTab === "image" && <div className="watermark-content"><button className="image-upload" onClick={() => watermarkFileRef.current?.click()}>{watermarkImage ? `已选择：${watermarkImage.name}` : "上传图片水印"}</button><label className="opacity">透明度<input type="range" min="8" max="100" value={watermarkOpacity} onPointerDown={() => { watermarkEditSnapshot.current = null; }} onPointerUp={() => { watermarkEditSnapshot.current = null; }} onBlur={() => { watermarkEditSnapshot.current = null; }} onChange={(e) => changeImageOpacity(Number(e.target.value))} /><input className="watermark-number" type="number" min="8" max="100" value={watermarkOpacity} onChange={(e) => changeImageOpacity(Math.max(8, Math.min(100, Number(e.target.value) || 8)))} />%</label><label className="opacity">旋转<input type="range" min="-180" max="180" value={watermarkRotation} onPointerDown={() => { watermarkEditSnapshot.current = null; }} onPointerUp={() => { watermarkEditSnapshot.current = null; }} onBlur={() => { watermarkEditSnapshot.current = null; }} onChange={(e) => changeImageRotation(Number(e.target.value))} /><input className="watermark-number" type="number" min="-180" max="180" value={watermarkRotation} onChange={(e) => changeImageRotation(Math.max(-180, Math.min(180, Number(e.target.value) || 0)))} />°</label><label className="mode">合成方式<select value={imageBlendMode} onChange={(e) => changeImageBlendMode(e.target.value as ImageBlendMode)}><option value="source-over">正常</option><option value="multiply">正片叠底</option></select></label><button className="secondary" onClick={saveImageWatermarkPreset} disabled={!watermarkImage && !safeMarks.some((mark) => (safeSelectedIds.includes(mark.id) || mark.id === selectedId) && mark.tool === "watermark" && mark.image)}>{presetStatus === "saved" ? "已保存 ✓" : presetStatus === "failed" ? "保存失败" : "存为常用"}</button><button onClick={addImageWatermark} disabled={!watermarkImage}>确认添加</button><input ref={watermarkFileRef} type="file" accept="image/*" hidden onChange={(e) => loadWatermarkImage(e.target.files?.[0])} /></div>}
      {watermarkTab === "saved" && <div className="watermark-content presets">{savedWatermarks.length ? savedWatermarks.map((preset) => <span key={preset.id} className="preset-item"><button className="preset" onClick={() => addSavedWatermark(preset)} style={{ color: preset.color }}>{preset.image ? "图片水印" : preset.text}</button><button className="preset-delete" onClick={() => deleteSavedWatermark(preset.id)} aria-label={`删除${preset.image ? "图片" : "文字"}水印`}>×</button></span>) : <span>把文字或图片水印“存为常用”后，会显示在这里。</span>}</div>}
    </section>}
    <section className={`workspace ${dragging ? "drawing" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }} onPointerDown={tool === "select" ? startDrawing : undefined} onPointerMove={tool === "select" ? moveDrawing : undefined} onPointerUp={tool === "select" ? finishDrawing : undefined} onPointerCancel={tool === "select" ? finishDrawing : undefined} onPointerLeave={() => { if (tool === "select" && !dragStart.current) setHoveredId(null); }}>
      {!size.width ? <button className="drop-zone" onClick={() => fileRef.current?.click()}><span className="upload-art"><i>↑</i></span><strong>拖入一张图片，开始标注</strong><small>或点击选择图片 · 也可以直接粘贴截图</small><div className="product-highlights" aria-label="产品亮点"><span><b>轻量</b> 浏览器内处理</span><span><b>灵活</b> 文字、形状、箭头、模糊</span><span><b>可控</b> 水印实时预览</span></div><b>选择图片</b></button> :
        <div className="canvas-stage"><canvas className={tool === "select" ? "selecting" : ""} ref={canvasRef} width={size.width} height={size.height} onPointerDown={tool === "select" ? undefined : startDrawing} onPointerMove={tool === "select" ? undefined : moveDrawing} onPointerUp={tool === "select" ? undefined : finishDrawing} onPointerCancel={tool === "select" ? undefined : finishDrawing} aria-label="图片标注画布" /><div className="image-meta"><span>{fileName}</span><button onClick={() => fileRef.current?.click()}>更换图片</button></div></div>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
    </section>
    <footer><span>图片仅在你的浏览器中处理</span><span>水印添加后可用移动工具整体拖动 · 文字右下圆点可等比缩放 · Ctrl/⌘ + Z 撤销</span><span className="footer-brand"><img src="/enter-game-logo.png" alt="视频号 logo" /><b>Enter.AI × Game.AI</b></span></footer>
  </main>;
}
