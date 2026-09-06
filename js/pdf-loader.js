// js/pdf-loader.js - PDF.js Wrapper & High-DPI Canvas Rendering Engine

class PDFDocumentEngine {
  constructor() {
    this.pdfDoc = null;
    this.demoDeck = new DemoSlideDeck();
    this.isDemo = true;
    this.documentTitle = 'Interactive Presentation Showcase.pdf';
    this.totalPages = this.demoDeck.totalPages;
    this.renderTaskQueue = new Map();
    this.cachedThumbnails = new Map();

    // Configure PDF.js worker
    if (window.pdfjsLib) {
      const isViewsSubdir = window.location.pathname.includes('/views/');
      const workerPath = isViewsSubdir ? '../vendor/pdfjs/pdf.worker.min.js' : 'vendor/pdfjs/pdf.worker.min.js';
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
    }
  }

  async loadDemo() {
    this.isDemo = true;
    this.pdfDoc = null;
    this.documentTitle = this.demoDeck.title;
    this.totalPages = this.demoDeck.totalPages;
    this.cachedThumbnails.clear();
    return {
      title: this.documentTitle,
      totalPages: this.totalPages,
      isDemo: true
    };
  }

  async loadPDFFromUrl(pdfUrl, filename = 'Presentation.pdf') {
    if (!window.pdfjsLib) {
      console.warn('PDF.js not available, using demo deck');
      return this.loadDemo();
    }

    try {
      const loadingTask = window.pdfjsLib.getDocument({
        url: pdfUrl,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
      });
      this.pdfDoc = await loadingTask.promise;
      this.isDemo = false;
      this.documentTitle = filename;
      this.totalPages = this.pdfDoc.numPages;
      this.cachedThumbnails.clear();

      return {
        title: this.documentTitle,
        totalPages: this.totalPages,
        isDemo: false
      };
    } catch (err) {
      console.error('[PDF Load Error]', err);
      throw err;
    }
  }

  async loadPDFData(data, filename = 'Presentation.pdf') {
    if (!window.pdfjsLib) {
      console.warn('PDF.js not available, using demo deck');
      return this.loadDemo();
    }

    try {
      const loadingTask = window.pdfjsLib.getDocument({
        data: data,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
      });
      this.pdfDoc = await loadingTask.promise;
      this.isDemo = false;
      this.documentTitle = filename;
      this.totalPages = this.pdfDoc.numPages;
      this.cachedThumbnails.clear();

      return {
        title: this.documentTitle,
        totalPages: this.totalPages,
        isDemo: false
      };
    } catch (err) {
      console.error('[PDF Load Error]', err);
      throw err;
    }
  }

  async renderPageToCanvas(pageNumber, targetCanvas, options = {}) {
    if (!targetCanvas) return;
    if (pageNumber < 1 || pageNumber > this.totalPages) return;

    if (this.isDemo || !this.pdfDoc) {
      const BASE_W = 1920;
      const BASE_H = 1080;
      const dpr = window.devicePixelRatio || 1;

      let cssW = BASE_W;
      let cssH = BASE_H;

      if (options.targetWidth && options.targetHeight) {
        const fitScale = Math.min(options.targetWidth / BASE_W, options.targetHeight / BASE_H);
        cssW = Math.round(BASE_W * fitScale);
        cssH = Math.round(BASE_H * fitScale);
      } else if (options.width && options.height) {
        const fitScale = Math.min(options.width / BASE_W, options.height / BASE_H);
        cssW = Math.round(BASE_W * fitScale);
        cssH = Math.round(BASE_H * fitScale);
      } else if (options.targetWidth) {
        cssW = Math.round(options.targetWidth);
        cssH = Math.round(options.targetWidth * (BASE_H / BASE_W));
      } else if (options.width) {
        cssW = Math.round(options.width);
        cssH = Math.round(options.width * (BASE_H / BASE_W));
      } else if (options.scale) {
        cssW = Math.round(BASE_W * options.scale);
        cssH = Math.round(BASE_H * options.scale);
      }

      // Render at high-DPI resolution for crisp anti-aliased text and vector graphics
      const renderScale = Math.max(1, Math.min(dpr, 2.0));
      const renderW = Math.round(cssW * renderScale);
      const renderH = Math.round(cssH * renderScale);

      targetCanvas.style.width = `${cssW}px`;
      targetCanvas.style.height = `${cssH}px`;
      this.demoDeck.renderSlideToCanvas(pageNumber, targetCanvas, renderW, renderH);
      return;
    }

    if (this.renderTaskQueue.has(targetCanvas)) {
      const prevTask = this.renderTaskQueue.get(targetCanvas);
      try { prevTask.cancel(); } catch(e) {}
      this.renderTaskQueue.delete(targetCanvas);
    }

    const page = await this.pdfDoc.getPage(pageNumber);
    const dpr = window.devicePixelRatio || 1;
    const baseViewport = page.getViewport({ scale: 1.0 });

    let scale = (options.scale || 1.5) * dpr;
    if (options.targetWidth) {
      scale = (options.targetWidth / baseViewport.width) * dpr;
    } else if (options.width && options.height) {
      const scaleX = options.width / baseViewport.width;
      const scaleY = options.height / baseViewport.height;
      scale = Math.min(scaleX, scaleY) * dpr;
    }

    const viewport = page.getViewport({ scale: scale });

    // 1. Render completely into an off-screen canvas in memory first
    // This prevents any progressive painting, white background flash, or GPU texture resets
    const offscreen = document.createElement('canvas');
    offscreen.width = viewport.width;
    offscreen.height = viewport.height;
    const offCtx = offscreen.getContext('2d');

    const renderContext = {
      canvasContext: offCtx,
      viewport: viewport
    };

    const renderTask = page.render(renderContext);
    this.renderTaskQueue.set(targetCanvas, renderTask);

    try {
      await renderTask.promise;

      // 2. Once 100% complete, synchronously copy to target DOM canvas in a single instant paint
      targetCanvas.width = viewport.width;
      targetCanvas.height = viewport.height;

      const cssScale = scale / dpr;
      targetCanvas.style.width = `${Math.round(baseViewport.width * cssScale)}px`;
      targetCanvas.style.height = `${Math.round(baseViewport.height * cssScale)}px`;

      const ctx = targetCanvas.getContext('2d');
      ctx.drawImage(offscreen, 0, 0);
    } catch (e) {
      if (e.name !== 'RenderingCancelledException') {
        console.error('[PDF Render Page Error]', e);
      }
    } finally {
      this.renderTaskQueue.delete(targetCanvas);
    }
  }

  async renderThumbnail(pageNumber, targetCanvas, thumbWidth = 260) {
    if (this.isDemo || !this.pdfDoc) {
      const thumbHeight = Math.round(thumbWidth * (9 / 16));
      targetCanvas.style.width = `${thumbWidth}px`;
      targetCanvas.style.height = `${thumbHeight}px`;
      this.demoDeck.renderSlideToCanvas(pageNumber, targetCanvas, thumbWidth * 2, thumbHeight * 2);
      return;
    }

    return this.renderPageToCanvas(pageNumber, targetCanvas, { targetWidth: thumbWidth });
  }

  getSpeakerNotes(pageNumber) {
    if (this.isDemo) {
      const slide = this.demoDeck.getSlide(pageNumber);
      return slide ? slide.notes : '';
    }
    return '';
  }
}

window.PDFDocumentEngine = PDFDocumentEngine;
