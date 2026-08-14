"use client";

import { ChangeEvent, PointerEvent, useCallback, useEffect, useRef, useState } from "react";

type Tool = "select" | "rect" | "circle" | "highlight" | "line" | "arrow" | "text";
type WatermarkMode = "corner" | "center" | "diagonal" | "tile" | "tileHorizontal" | "tileVertical";
type Point = { x: number; y: number };
type Mark = { id: number; tool: Exclude<Tool, "select"> | "watermark"; start: Point; end: Point; color: string; width: number; text?: string; opacity?: number; repeat?: boolean; watermarkMode?: WatermarkMode };

const tools: { id: Tool; icon: string; label: string; shortcut: string }[] = [
  { id: "select", icon: "select", label: "移动", shortcut: "V" },
  { id: "rect", icon: "rect", label: "线框", shortcut: "R" }, { id: "circle", icon: "circle", label: "圆框", shortcut: "C" }, { id: "highlight", icon: "highlight", label: "高亮", shortcut: "H" },
  { id: "arrow", icon: "arrow", label: "箭头", shortcut: "A" }, { id: "line", icon: "line", label: "直线", shortcut: "L" }, { id: "text", icon: "text", label: "文字", shortcut: "T" },
];
const colors = ["#00e1ff", "#ff00ea", "#ff5a36", "#ffb000", "#17a673", "#2774e6", "#8b5cf6", "#171717"];
const watermarkAnchor = (mode: WatermarkMode, width: number, height: number) => mode === "corner" ? { x: width - 130, y: height - 55 } : { x: width / 2, y: height / 2 };
const isWatermarkHit = (point: Point, mark: Mark, width: number, height: number) => {
  const mode = mark.watermarkMode ?? (mark.repeat ? "tile" : "corner");
  if (mode === "tile" || mode === "tileHorizontal" || mode === "tileVertical") return point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
  const fontSize = Math.max(12, mark.width || 34), textWidth = Math.max(fontSize, (mark.text || "水印").length * fontSize * .92);
  return point.x >= mark.start.x - textWidth / 2 && point.x <= mark.start.x + textWidth / 2 && point.y >= mark.start.y - fontSize / 2 && point.y <= mark.start.y + fontSize / 2;
};
const getTextBounds = (mark: Mark) => {
  const fontSize = Math.max(12, mark.width * 7), text = mark.text || "文字";
  return { left: mark.start.x - 8, top: mark.start.y - 6, right: mark.start.x + Math.max(fontSize, text.length * fontSize * .92) + 8, bottom: mark.start.y + fontSize * 1.2 + 6 };
};
const getMarkBounds = (mark: Mark) => {
  if (mark.tool === "text") return getTextBounds(mark);
  const pad = 10;
  return { left: Math.min(mark.start.x, mark.end.x) - pad, top: Math.min(mark.start.y, mark.end.y) - pad, right: Math.max(mark.start.x, mark.end.x) + pad, bottom: Math.max(mark.start.y, mark.end.y) + pad };
};
const distanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x, dy = end.y - start.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
};
const constrainSquare = (start: Point, end: Point) => {
  const dx = end.x - start.x, dy = end.y - start.y, side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) };
};
console.assert(distanceToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }) === 5, "标注命中检测失败");
const ToolIcon = ({ icon }: { icon: string }) => {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const shapes = {
    select: <path {...common} d="M12 3v18M3 12h18M12 3 9 6m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3" />,
    rect: <rect {...common} x="4" y="4" width="16" height="16" rx="2" />,
    circle: <circle {...common} cx="12" cy="12" r="8" />,
    highlight: <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />,
    arrow: <path {...common} d="M5 19 19 5m0 0h-7m7 0v7" />,
    line: <path {...common} d="M5 19 19 5" />,
    text: <path {...common} d="M5 5h14M12 5v14M8 19h8" />,
  }[icon as Tool];
  return <svg className="tool-glyph" viewBox="0 0 24 24" aria-hidden="true">{shapes}</svg>;
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null), imageRef = useRef<HTMLImageElement | null>(null), fileRef = useRef<HTMLInputElement>(null);
  const dragStart = useRef<Point | null>(null), moveSnapshot = useRef<Mark[] | null>(null), widthSnapshot = useRef<Mark[] | null>(null), watermarkDrag = useRef<{ start: Point; origin: Point } | null>(null), shapeResizeData = useRef<{ id: number; fixed: Point; offset: Point; snapshot: Mark[] } | null>(null), lineResizeData = useRef<{ id: number; endpoint: "start" | "end"; snapshot: Mark[] } | null>(null), resizeData = useRef<{ id: number; anchor: Point; baseWidth: number; baseHeight: number; width: number; snapshot: Mark[] } | null>(null), nextId = useRef(1);
  const rotateData = useRef<{ id: number; center: Point; length: number; snapshot: Mark[] } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fileName, setFileName] = useState(""), [tool, setTool] = useState<Tool>("rect"), [color, setColor] = useState(colors[0]);
  const [lineWidth, setLineWidth] = useState(5), [marks, setMarks] = useState<Mark[]>([]), [past, setPast] = useState<Mark[][]>([]), [future, setFuture] = useState<Mark[][]>([]);
  const [preview, setPreview] = useState<Mark | null>(null), [dragging, setDragging] = useState(false), [watermarkOpen, setWatermarkOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]), [selectionBox, setSelectionBox] = useState<{ start: Point; end: Point } | null>(null);
  const [watermark, setWatermark] = useState("仅供展示"), [watermarkOpacity, setWatermarkOpacity] = useState(22), [watermarkSize, setWatermarkSize] = useState(34), [watermarkMode, setWatermarkMode] = useState<WatermarkMode>("corner"), [watermarkPosition, setWatermarkPosition] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState("");
  const safeMarks = Array.isArray(marks) ? marks : [], safePast = Array.isArray(past) ? past : [], safeFuture = Array.isArray(future) ? future : [], safeSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];
  const selectedArrow = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && mark.tool === "arrow") : null;
  const chooseTool = (nextTool: Tool) => { setTool(nextTool); if (nextTool !== "select") { setSelectedId(null); setSelectedIds([]); setSelectionBox(null); } };

  const drawMark = useCallback((ctx: CanvasRenderingContext2D, mark: Mark) => {
    const { start, end } = mark;
    ctx.save(); ctx.strokeStyle = mark.color; ctx.fillStyle = mark.color; ctx.lineWidth = mark.width; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (mark.tool === "rect") ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    else if (mark.tool === "circle") {
      ctx.beginPath(); ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    else if (mark.tool === "highlight") { ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = .52; ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y); }
    else if (mark.tool === "line" || mark.tool === "arrow") {
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      if (mark.tool === "arrow") {
        const angle = Math.atan2(end.y - start.y, end.x - start.x), head = Math.max(18, mark.width * 4);
        ctx.beginPath(); ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y); ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6)); ctx.stroke();
      }
    } else if (mark.tool === "text") {
      ctx.font = `700 ${Math.max(12, mark.width * 7)}px system-ui, sans-serif`; ctx.textBaseline = "top"; ctx.fillText(mark.text || "文字", start.x, start.y);
    } else {
      ctx.globalAlpha = mark.opacity ?? .22; ctx.font = `700 ${Math.max(12, mark.width || 34)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const mode = mark.watermarkMode ?? (mark.repeat ? "tile" : "corner");
      if (mode === "tile" || mode === "tileHorizontal" || mode === "tileVertical") {
        ctx.translate(start.x, start.y); ctx.rotate(-Math.PI / 7);
        const horizontal = mode !== "tileVertical", vertical = mode !== "tileHorizontal";
        const xStart = horizontal ? -size.width : 0, xEnd = horizontal ? size.width : 0, yStart = vertical ? -size.height : 0, yEnd = vertical ? size.height : 0;
        for (let y = yStart; y <= yEnd; y += 150) for (let x = xStart; x <= xEnd; x += 310) ctx.fillText(mark.text || "水印", x, y);
      } else if (mode === "center") ctx.fillText(mark.text || "水印", start.x, start.y);
      else if (mode === "diagonal") { ctx.translate(start.x, start.y); ctx.rotate(-Math.PI / 7); ctx.fillText(mark.text || "水印", 0, 0); }
      else ctx.fillText(mark.text || "水印", start.x, start.y);
    }
    ctx.restore();
  }, [size]);

  const renderCanvas = useCallback((showSelection = true) => {
    const canvas = canvasRef.current, image = imageRef.current;
    if (!canvas || !image || !size.width) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height); ctx.drawImage(image, 0, 0, size.width, size.height);
    safeMarks.forEach((mark) => drawMark(ctx, mark)); if (preview) drawMark(ctx, preview);
    if (showSelection && watermarkOpen && watermark.trim()) drawMark(ctx, { id: -1, tool: "watermark", start: watermarkPosition ?? watermarkAnchor(watermarkMode, size.width, size.height), end: { x: 0, y: 0 }, color, width: watermarkSize, text: watermark.trim(), opacity: watermarkOpacity / 100, watermarkMode });
    if (showSelection && tool === "select") safeMarks.filter((mark) => safeSelectedIds.includes(mark.id) && mark.id !== selectedId).forEach((mark) => {
      const bounds = getMarkBounds(mark); ctx.save(); ctx.strokeStyle = "#2774e6"; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top); ctx.restore();
    });
    const selected = showSelection && tool === "select" ? safeMarks.find((mark) => mark.id === selectedId) : null;
    if (selected?.tool === "watermark") {
      ctx.save(); ctx.strokeStyle = "#2774e6"; ctx.fillStyle = "white"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.strokeRect(8, 8, size.width - 16, size.height - 16); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(selected.start.x, selected.start.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (selected && ["rect", "circle", "highlight", "line", "arrow", "text"].includes(selected.tool)) {
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
        if (selected.tool === "circle") { ctx.beginPath(); ctx.ellipse((left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
        else ctx.strokeRect(left, top, right - left, bottom - top);
      }
      ctx.setLineDash([]); corners.forEach((point, index) => { const resizeHandle = (selected.tool === "rect" || selected.tool === "circle" || selected.tool === "highlight" || selected.tool === "text") && index === 2; ctx.fillStyle = resizeHandle ? "#ffd43b" : "white"; ctx.beginPath(); ctx.arc(point.x, point.y, resizeHandle ? 10 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      if (selected.tool === "line" || selected.tool === "arrow") [selected.start, selected.end].forEach((point) => { ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(point.x, point.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      if (selected.tool === "arrow") {
        const center = { x: (selected.start.x + selected.end.x) / 2, y: (selected.start.y + selected.end.y) / 2 };
        ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(center.x, center.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#2774e6"; ctx.font = "700 18px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("↻", center.x, center.y + 1);
      }
      ctx.restore();
    }
    if (showSelection && tool === "select" && selectionBox) {
      const left = Math.min(selectionBox.start.x, selectionBox.end.x), top = Math.min(selectionBox.start.y, selectionBox.end.y);
      const right = Math.max(selectionBox.start.x, selectionBox.end.x), bottom = Math.max(selectionBox.start.y, selectionBox.end.y);
      ctx.save(); ctx.fillStyle = "#2774e61a"; ctx.strokeStyle = "#2774e6"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.fillRect(left, top, right - left, bottom - top); ctx.strokeRect(left, top, right - left, bottom - top); ctx.restore();
    }
  }, [safeMarks, safeSelectedIds, preview, size, selectedId, tool, selectionBox, drawMark, watermarkOpen, watermark, watermarkMode, watermarkSize, watermarkOpacity, watermarkPosition, color]);

  useEffect(() => { renderCanvas(); }, [renderCanvas]);

  const getPoint = (event: PointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current!, box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height };
  };
  const loadFile = useCallback((file?: File | null) => {
    if (!file?.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      imageRef.current = image; setSize({ width: Math.round(image.naturalWidth * scale), height: Math.round(image.naturalHeight * scale) });
      setFileName(file.name); setMarks([]); setPast([]); setFuture([]); setSelectedId(null); setSelectedIds([]); setSelectionBox(null); setWatermarkPosition(null); widthSnapshot.current = null; shapeResizeData.current = null; lineResizeData.current = null; URL.revokeObjectURL(url);
    };
    image.src = url;
  }, []);
  const commit = (mark: Mark) => { setMarks((items) => { const current = Array.isArray(items) ? items : []; setPast((history) => [...(Array.isArray(history) ? history : []), current]); return [...current, mark]; }); setFuture([]); };
  const findMovableMark = (point: Point) => {
    const hitMark = (mark: Mark) => {
      if (mark.tool === "watermark") return isWatermarkHit(point, mark, size.width, size.height);
      if (mark.tool === "line" || mark.tool === "arrow") return distanceToSegment(point, mark.start, mark.end) <= Math.max(14, mark.width * 2);
      if (mark.tool !== "rect" && mark.tool !== "circle" && mark.tool !== "highlight" && mark.tool !== "text") return false;
      const bounds = getMarkBounds(mark); return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
    };
    return [...safeMarks].reverse().find((mark) => mark.tool !== "watermark" && hitMark(mark)) ?? [...safeMarks].reverse().find(hitMark);
  };
  const startDrawing = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
    const point = getPoint(event);
    if (tool === "select") {
      const selectedText = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && mark.tool === "text") : null;
      if (selectedText) {
        const bounds = getTextBounds(selectedText);
        if (Math.hypot(point.x - bounds.right, point.y - bounds.bottom) <= 16) {
          event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point;
          resizeData.current = { id: selectedText.id, anchor: { x: bounds.left, y: bounds.top }, baseWidth: bounds.right - bounds.left, baseHeight: bounds.bottom - bounds.top, width: selectedText.width, snapshot: safeMarks };
          setDragging(true); return;
        }
      }
      const selectedShape = safeSelectedIds.length === 1 ? safeMarks.find((mark) => mark.id === selectedId && (mark.tool === "rect" || mark.tool === "circle" || mark.tool === "highlight")) : null;
      if (selectedShape) {
        const bounds = getMarkBounds(selectedShape), maxX = Math.max(selectedShape.start.x, selectedShape.end.x), maxY = Math.max(selectedShape.start.y, selectedShape.end.y);
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
      const selected = findMovableMark(point);
      if (selected) {
        const ids = safeSelectedIds.includes(selected.id) ? safeSelectedIds : [selected.id];
        setSelectedIds(ids); setSelectedId(selected.id); setColor(selected.color); if (selected.tool !== "watermark") setLineWidth(selected.width); event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point; moveSnapshot.current = safeMarks; setDragging(true);
      } else if (watermarkOpen && watermark.trim()) {
        const draft = { id: -1, tool: "watermark" as const, start: watermarkPosition ?? watermarkAnchor(watermarkMode, size.width, size.height), end: { x: 0, y: 0 }, color, width: watermarkSize, text: watermark.trim(), opacity: watermarkOpacity / 100, watermarkMode };
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
    if (!dragStart.current) return;
    const point = getPoint(event);
    if (tool === "line" && event.shiftKey) point.y = dragStart.current.y;
    if (tool === "circle" && event.shiftKey) Object.assign(point, constrainSquare(dragStart.current, point));
    if (tool === "select" && watermarkDrag.current) {
      const { start, origin } = watermarkDrag.current;
      setWatermarkPosition({ x: origin.x + point.x - start.x, y: origin.y + point.y - start.y });
    } else if (tool === "select" && lineResizeData.current) {
      const { id, endpoint, snapshot } = lineResizeData.current;
      setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, [endpoint]: point } : mark));
    } else if (tool === "select" && rotateData.current) {
      const { center, length, id, snapshot } = rotateData.current, angle = Math.atan2(point.y - center.y, point.x - center.x), half = length / 2;
      if (Math.hypot(point.x - center.x, point.y - center.y) > 3) setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, start: { x: center.x - Math.cos(angle) * half, y: center.y - Math.sin(angle) * half }, end: { x: center.x + Math.cos(angle) * half, y: center.y + Math.sin(angle) * half } } : mark));
    } else if (tool === "select" && shapeResizeData.current) {
      const { fixed, offset, id, snapshot } = shapeResizeData.current;
      setMarks(snapshot.map((mark) => mark.id === id ? { ...mark, start: fixed, end: { x: point.x - offset.x - 8, y: point.y - offset.y - 8 } } : mark));
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
    if (tool === "line" && event.shiftKey) end.y = start.y;
    if (tool === "circle" && event.shiftKey) Object.assign(end, constrainSquare(start, end));
    if (tool === "select") {
      const watermarkMoving = watermarkDrag.current, lineResizing = lineResizeData.current, rotation = rotateData.current, shapeResizing = shapeResizeData.current, resizing = resizeData.current, movement = moveSnapshot.current, marquee = selectionBox;
      if (!watermarkMoving && lineResizing && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = lineResizing.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && rotation && Math.hypot(end.x - rotation.center.x, end.y - rotation.center.y) > 3) { const snapshot = rotation.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && shapeResizing && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = shapeResizing.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && resizing && Math.hypot(end.x - start.x, end.y - start.y) > 3) { const snapshot = resizing.snapshot; setPast((history) => [...(Array.isArray(history) ? history : []), snapshot]); setFuture([]); }
      else if (!watermarkMoving && movement && Math.hypot(end.x - start.x, end.y - start.y) > 1) { setPast((history) => [...(Array.isArray(history) ? history : []), movement]); setFuture([]); }
      else if (!watermarkMoving && marquee) {
        const left = Math.min(marquee.start.x, marquee.end.x), top = Math.min(marquee.start.y, marquee.end.y), right = Math.max(marquee.start.x, marquee.end.x), bottom = Math.max(marquee.start.y, marquee.end.y);
        const ids = safeMarks.filter((mark) => mark.tool !== "watermark").filter((mark) => { const bounds = getMarkBounds(mark); return bounds.left <= right && bounds.right >= left && bounds.top <= bottom && bounds.bottom >= top; }).map((mark) => mark.id);
        setSelectedIds(ids); setSelectedId(ids[0] ?? null);
      }
      moveSnapshot.current = null; rotateData.current = null; shapeResizeData.current = null; lineResizeData.current = null; resizeData.current = null; watermarkDrag.current = null;
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
      const current = Array.isArray(items) ? items : [], selected = current.filter((mark) => ids.includes(mark.id) && mark.tool !== "watermark");
      if (!selected.length || selected.every((mark) => mark.width === nextWidth)) return current;
      if (!widthSnapshot.current) { widthSnapshot.current = current; setPast((history) => [...(Array.isArray(history) ? history : []), current]); setFuture([]); }
      return current.map((mark) => ids.includes(mark.id) && mark.tool !== "watermark" ? { ...mark, width: nextWidth } : mark);
    });
  };
  const addWatermark = () => {
    if (!watermark.trim() || !imageRef.current) return;
    const start = watermarkPosition ?? watermarkAnchor(watermarkMode, size.width, size.height);
    commit({ id: nextId.current++, tool: "watermark", start, end: { x: 0, y: 0 }, color, width: watermarkSize, text: watermark.trim(), opacity: watermarkOpacity / 100, watermarkMode }); setWatermarkOpen(false);
  };
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
      <div className="top-actions"><div className="history-actions"><button onClick={undo} disabled={!safePast.length} aria-label="撤销"><span>撤销</span><kbd>⌘Z</kbd></button><button onClick={redoLast} disabled={!safeFuture.length} aria-label="重做"><span>重做</span><kbd>⇧⌘Z</kbd></button></div><button className="delete-button" onClick={deleteSelected} disabled={selectedId === null && !safeSelectedIds.length} title="删除选中的标注"><span>删除</span><kbd>⌫</kbd></button><button className="download-button" onClick={download} disabled={!size.width}>下载图片 <span>↓</span></button></div>
    </header>
    <section className="toolbar" aria-label="标注工具栏">
      <div className="tool-area"><div className="tool-group">{tools.map((item) => <button key={item.id} className={`tool-button ${tool === item.id ? "active" : ""}`} onClick={() => chooseTool(item.id)} aria-pressed={tool === item.id}><ToolIcon icon={item.icon} /><span className="tool-label">{item.label}</span></button>)}</div><div className="shortcut-row" aria-label="工具快捷键">{tools.map((item) => <kbd key={item.id} className={tool === item.id ? "active" : ""}>{item.shortcut}</kbd>)}</div></div>
      {tool === "text" && <label className="text-entry">文字<input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="输入后点击图片" autoFocus /></label>}
      <div className="divider" />
      <div className="colors" aria-label="颜色">{colors.map((item) => <button key={item} className={color === item ? "selected" : ""} style={{ background: item }} onClick={() => changeColor(item)} aria-label={`选择颜色 ${item}`} />)}<label className="custom-color" title="自定义颜色"><input type="color" value={color} onChange={(e: ChangeEvent<HTMLInputElement>) => changeColor(e.target.value)} /><span>＋</span></label></div>
      <label className="width-control">粗细<input type="range" min="2" max="14" value={lineWidth} onChange={(e) => changeWidth(Number(e.target.value))} onPointerDown={() => { widthSnapshot.current = null; }} onPointerUp={() => { widthSnapshot.current = null; }} onBlur={() => { widthSnapshot.current = null; }} /></label>
      <button className={`watermark-button ${watermarkOpen ? "active" : ""}`} onClick={() => setWatermarkOpen((open) => { if (!open && size.width) setWatermarkPosition(watermarkAnchor(watermarkMode, size.width, size.height)); return !open; })}>添加水印</button>
    </section>
    {watermarkOpen && <section className="watermark-panel">
      <label>水印文字<input value={watermark} onChange={(e) => setWatermark(e.target.value)} autoFocus /></label>
      <label className="opacity">透明度<input type="range" min="8" max="70" value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} /><span>{watermarkOpacity}%</span></label>
      <label className="opacity">大小<input type="range" min="16" max="96" value={watermarkSize} onChange={(e) => setWatermarkSize(Number(e.target.value))} /><span>{watermarkSize}px</span></label>
      <label className="mode">展示方式<select value={watermarkMode} onChange={(e) => { const next = e.target.value as WatermarkMode; setWatermarkMode(next); if (size.width) setWatermarkPosition(watermarkAnchor(next, size.width, size.height)); }}><option value="corner">右下角</option><option value="center">居中</option><option value="diagonal">斜向居中</option><option value="tile">平铺（横竖）</option><option value="tileHorizontal">水平平铺</option><option value="tileVertical">垂直平铺</option></select></label><button onClick={addWatermark}>添加水印</button>
    </section>}
    <section className={`workspace ${dragging ? "drawing" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }} onPointerDown={tool === "select" ? startDrawing : undefined} onPointerMove={tool === "select" ? moveDrawing : undefined} onPointerUp={tool === "select" ? finishDrawing : undefined} onPointerCancel={tool === "select" ? finishDrawing : undefined}>
      {!size.width ? <button className="drop-zone" onClick={() => fileRef.current?.click()}><span className="upload-art"><i>↑</i></span><strong>拖入一张图片，开始标注</strong><small>或点击选择图片 · 也可以直接粘贴截图</small><b>选择图片</b></button> :
        <div className="canvas-stage"><canvas className={tool === "select" ? "selecting" : ""} ref={canvasRef} width={size.width} height={size.height} onPointerDown={tool === "select" ? undefined : startDrawing} onPointerMove={tool === "select" ? undefined : moveDrawing} onPointerUp={tool === "select" ? undefined : finishDrawing} onPointerCancel={tool === "select" ? undefined : finishDrawing} aria-label="图片标注画布" /><div className="image-meta"><span>{fileName}</span><button onClick={() => fileRef.current?.click()}>更换图片</button></div></div>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
    </section>
    <footer><span>图片仅在你的浏览器中处理</span><span>水印添加后可用移动工具整体拖动 · 文字右下圆点可等比缩放 · Ctrl/⌘ + Z 撤销</span></footer>
  </main>;
}
