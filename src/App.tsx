import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { PDFDocument } from 'pdf-lib';
import { FileUp, FileText, Check, Download, Trash2, CheckSquare, Square, RefreshCw } from 'lucide-react';
import { cn } from './lib/utils';

// Initialize pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PageThumbnail = React.memo(({ pdf, pageNumber, selected, onToggle }: {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  selected: boolean;
  onToggle: (pageNum: number) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || rendered || !pdf || !canvasRef.current) return;

    let renderTask: pdfjsLib.RenderTask;
    let isCancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: 1.0 });
        // Scale down for thumbnail to save memory and improve performance
        const scale = 300 / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;

        renderTask = page.render({ canvasContext: context, viewport: scaledViewport });
        await renderTask.promise;

        if (!isCancelled) {
          setRendered(true);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Error rendering page', pageNumber, err);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [isVisible, rendered, pdf, pageNumber]);

  return (
    <div
      ref={containerRef}
      onClick={() => onToggle(pageNumber)}
      className={cn(
        "relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-200 bg-white shadow-sm flex items-center justify-center group",
        selected ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200 hover:border-gray-300 hover:shadow-md"
      )}
      style={{ aspectRatio: '1 / 1.4' }}
    >
      <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />

      {/* Overlay */}
      <div className={cn(
        "absolute inset-0 transition-opacity duration-200",
        selected ? "bg-blue-500/10" : "bg-black/0 group-hover:bg-black/5"
      )} />

      {/* Checkbox */}
      <div className={cn(
        "absolute top-2 right-2 rounded-full p-1 transition-transform duration-200",
        selected ? "bg-blue-500 text-white scale-100" : "bg-white/80 text-gray-400 scale-0 group-hover:scale-100 shadow-sm"
      )}>
        <Check className="w-4 h-4" />
      </div>

      {/* Page Number */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 text-xs text-center py-1.5 backdrop-blur-md transition-colors duration-200",
        selected ? "bg-blue-500/90 text-white" : "bg-gray-900/60 text-white"
      )}>
        第 {pageNumber} 页
      </div>
    </div>
  );
});
PageThumbnail.displayName = 'PageThumbnail';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileUpload = async (uploadedFile: File) => {
    if (uploadedFile.type !== 'application/pdf') {
      alert('请上传 PDF 文件！');
      return;
    }

    setIsLoading(true);
    setFile(uploadedFile);
    setSelectedPages(new Set());
    setPdfDoc(null);

    try {
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
    } catch (error) {
      console.error("Error loading PDF:", error);
      alert("无法加载 PDF 文件，请确保文件未损坏。");
      setFile(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Drag events
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileUpload(droppedFile);
  };

  // Selection logic
  const togglePage = useCallback((pageNum: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  }, []);

  const selectAll = () => {
    const all = new Set<number>();
    for (let i = 1; i <= numPages; i++) all.add(i);
    setSelectedPages(all);
  };

  const invertSelection = () => {
    setSelectedPages(prev => {
      const next = new Set<number>();
      for (let i = 1; i <= numPages; i++) {
        if (!prev.has(i)) next.add(i);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedPages(new Set());

  // Export logic
  const handleExport = async () => {
    if (!file || selectedPages.size === 0) return;
    setIsExporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const originalPdf = await PDFDocument.load(arrayBuffer);
      const newPdf = await PDFDocument.create();

      // pdf-lib uses 0-indexed pages
      const indices = Array.from(selectedPages).map(p => p - 1).sort((a, b) => a - b);
      const copiedPages = await newPdf.copyPages(originalPdf, indices);

      copiedPages.forEach(page => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `提取_${file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting PDF:", error);
      alert("导出 PDF 时出错。");
    } finally {
      setIsExporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPdfDoc(null);
    setNumPages(0);
    setSelectedPages(new Set());
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-500 p-2 rounded-lg text-white">
              <FileText className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">PDF 页面提取工具</h1>
          </div>
          {file && (
            <button
              onClick={reset}
              className="text-sm text-gray-500 hover:text-gray-900 flex items-center space-x-1.5 transition-colors px-3 py-1.5 rounded-md hover:bg-gray-100"
            >
              <Trash2 className="w-4 h-4" />
              <span>重新上传</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!file ? (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              "mt-10 border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center transition-all duration-200",
              isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
            )}
          >
            <div className={cn(
              "p-4 rounded-full mb-4 transition-colors duration-200",
              isDragging ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
            )}>
              <FileUp className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium mb-2">点击或拖拽上传 PDF 文件</h3>
            <p className="text-sm text-gray-500 mb-6 text-center max-w-sm">
              支持任意大小的 PDF 文件。所有处理均在您的浏览器中本地完成，不会上传到任何服务器，保障您的隐私安全。
            </p>
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm">
              选择文件
              <input
                type="file"
                className="hidden"
                accept="application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
            </label>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
            <p className="text-gray-600">正在解析 PDF 文件...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-20 z-10">
              <div className="flex items-center space-x-4 overflow-x-auto pb-2 sm:pb-0">
                <button onClick={selectAll} className="flex items-center space-x-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors whitespace-nowrap">
                  <CheckSquare className="w-4 h-4" />
                  <span>全选</span>
                </button>
                <button onClick={invertSelection} className="flex items-center space-x-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors whitespace-nowrap">
                  <RefreshCw className="w-4 h-4" />
                  <span>反选</span>
                </button>
                <button onClick={clearSelection} className="flex items-center space-x-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors whitespace-nowrap">
                  <Square className="w-4 h-4" />
                  <span>清空</span>
                </button>
                <div className="w-px h-4 bg-gray-300 mx-2 hidden sm:block"></div>
                <div className="text-sm text-gray-500 whitespace-nowrap">
                  已选择 <span className="font-semibold text-blue-600">{selectedPages.size}</span> / {numPages} 页
                </div>
              </div>

              <button
                onClick={handleExport}
                disabled={selectedPages.size === 0 || isExporting}
                className={cn(
                  "flex items-center justify-center space-x-2 px-6 py-2.5 rounded-lg font-medium transition-all shadow-sm whitespace-nowrap",
                  selectedPages.size === 0
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow"
                )}
              >
                {isExporting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{isExporting ? '导出中...' : '导出选中页面'}</span>
              </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 pb-10">
              {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                <PageThumbnail
                  key={pageNum}
                  pdf={pdfDoc!}
                  pageNumber={pageNum}
                  selected={selectedPages.has(pageNum)}
                  onToggle={togglePage}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
