// js/demo-deck.js - Built-in Multi-Slide Presentation Deck Generator

class DemoSlideDeck {
  constructor() {
    this.title = 'Interactive Presentation Showcase.pdf';
    this.slides = [
      {
        id: 1,
        title: 'Next-Gen PDF Presentation Web App',
        subtitle: 'Dual-Screen Presenter View & Bitfocus Companion Integration',
        badge: 'KEYNOTE PRESENTATION 2026',
        author: 'Antigravity Presentation Suite',
        type: 'title',
        notes: 'Welcome everyone! In this presentation, we demonstrate how this web app allows you to present any PDF on a second monitor while keeping full control with a PowerPoint-style presenter cockpit on your laptop.'
      },
      {
        id: 2,
        title: 'PowerPoint-Style Presenter Cockpit',
        subtitle: 'Everything a speaker needs for confident, flawless delivery',
        type: 'three_cards',
        cards: [
          {
            icon: '🖥️',
            title: 'Dual-Screen Preview',
            desc: 'View active slide in high resolution alongside an upcoming next-slide preview so you always know what to say next.'
          },
          {
            icon: '⏱️',
            title: 'Live Timer & Clock',
            desc: 'Track presentation duration with elapsed time counters, pause/reset controls, and a synchronized real-time digital clock.'
          },
          {
            icon: '📝',
            title: 'Speaker Notes',
            desc: 'Type and review customized speaker notes per slide. All notes are auto-saved in your browser for your next session.'
          }
        ],
        notes: 'Notice on your right sidebar that you can already see the next slide preview and read these exact notes. Try editing this text!'
      },
      {
        id: 3,
        title: 'Bitfocus Companion & Stream Deck API',
        subtitle: 'Full broadcast-grade remote control from physical buttons & tablets',
        type: 'api_showcase',
        endpoints: [
          { method: 'POST', path: '/api/next', desc: 'Advance to next slide' },
          { method: 'POST', path: '/api/prev', desc: 'Return to previous slide' },
          { method: 'POST', path: '/api/blackout', desc: 'Toggle blackout curtain (B key)' },
          { method: 'GET', path: '/api/status', desc: 'Get live telemetry JSON for Stream Deck LCDs' }
        ],
        notes: 'Click the Companion API button in the top bar to test these live REST endpoints or copy them directly into your Bitfocus Companion configuration.'
      },
      {
        id: 4,
        title: 'Second Screen Projection & Laser Tools',
        subtitle: 'High-DPI vector rendering with synchronized laser pointer and digital ink',
        type: 'feature_grid',
        features: [
          { icon: '🔴', label: 'Real-Time Laser Pointer', desc: 'Move your cursor over the slide to project a glowing red laser dot on the audience display.' },
          { icon: '✏️', label: 'Digital Pen & Highlighter', desc: 'Draw annotations or circle key talking points directly on the slide canvas.' },
          { icon: '🔲', label: 'Instant Blank Curtains', desc: 'Press B (Black) or W (White) to hide slides during audience Q&A.' },
          { icon: '📱', label: 'Multi-Screen Auto-Placement', desc: 'Detects external monitors and opens the audience display in full-screen on screen 2.' }
        ],
        notes: 'Press "L" right now or click the Laser icon on the slide toolbar to test the synchronized laser pointer glow!'
      },
      {
        id: 5,
        title: 'High Performance & Offline Architecture',
        subtitle: 'Ultra-responsive client-side canvas engine with zero cloud latency',
        type: 'metrics',
        metrics: [
          { val: '< 5 ms', label: 'Slide Transition Latency' },
          { val: '4K / Retina', label: 'Vector Canvas Anti-Aliasing' },
          { val: '100% Local', label: 'Private & Offline Capable' },
          { val: '0 Dependencies', label: 'Lightweight Local Node Hub' }
        ],
        notes: 'This entire app runs completely locally on your computer with zero external server dependencies.'
      },
      {
        id: 6,
        title: 'Ready to Present Your Own PDF!',
        subtitle: 'Drag and drop any PDF file or use the file picker to begin',
        type: 'conclusion',
        steps: [
          '1. Click "📂 Load PDF" in the top bar or drag your PDF into this window.',
          '2. Click "📽️ Open Audience Screen" and position it on your projector/TV.',
          '3. Connect your Stream Deck, clicker, or keyboard and start your talk!'
        ],
        notes: 'You are now ready to present! Load any PDF document from your computer to get started.'
      }
    ];
  }

  get totalPages() {
    return this.slides.length;
  }

  getSlide(pageNumber) {
    const idx = Math.max(0, Math.min(pageNumber - 1, this.slides.length - 1));
    return this.slides[idx];
  }

  // Render slide to an HTML5 Canvas with pristine High-DPI scaling
  renderSlideToCanvas(pageNumber, targetCanvas, targetWidth = 1920, targetHeight = 1080) {
    const slide = this.getSlide(pageNumber);
    targetCanvas.width = targetWidth;
    targetCanvas.height = targetHeight;
    const ctx = targetCanvas.getContext('2d');

    // Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, targetWidth, targetHeight);
    bgGrad.addColorStop(0, '#0c1222');
    bgGrad.addColorStop(0.5, '#111936');
    bgGrad.addColorStop(1, '#090d19');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // Subtle decorative grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x < targetWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, targetHeight);
      ctx.stroke();
    }
    for (let y = 0; y < targetHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(targetWidth, y);
      ctx.stroke();
    }

    // Glow accents
    const radialGlow = ctx.createRadialGradient(targetWidth * 0.8, targetHeight * 0.2, 50, targetWidth * 0.8, targetHeight * 0.2, 500);
    radialGlow.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
    radialGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = radialGlow;
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // Render by type
    if (slide.type === 'title') {
      this.drawTitleSlide(ctx, slide, targetWidth, targetHeight);
    } else if (slide.type === 'three_cards') {
      this.drawThreeCardsSlide(ctx, slide, targetWidth, targetHeight);
    } else if (slide.type === 'api_showcase') {
      this.drawApiShowcaseSlide(ctx, slide, targetWidth, targetHeight);
    } else if (slide.type === 'feature_grid') {
      this.drawFeatureGridSlide(ctx, slide, targetWidth, targetHeight);
    } else if (slide.type === 'metrics') {
      this.drawMetricsSlide(ctx, slide, targetWidth, targetHeight);
    } else if (slide.type === 'conclusion') {
      this.drawConclusionSlide(ctx, slide, targetWidth, targetHeight);
    }

    // Slide footer bar
    this.drawSlideFooter(ctx, pageNumber, this.totalPages, targetWidth, targetHeight);
  }

  drawSlideHeader(ctx, slide, width, height) {
    // Top badge
    ctx.fillStyle = '#6366f1';
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.fillText('PRESENTATION SUITE', 100, 90);

    // Slide Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px -apple-system, sans-serif';
    ctx.fillText(slide.title, 100, 160);

    // Slide Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px -apple-system, sans-serif';
    ctx.fillText(slide.subtitle, 100, 210);

    // Header divider line
    const lineGrad = ctx.createLinearGradient(100, 240, width - 100, 240);
    lineGrad.addColorStop(0, 'rgba(99, 102, 241, 0.8)');
    lineGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.8)');
    lineGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(100, 240);
    ctx.lineTo(width - 100, 240);
    ctx.stroke();
  }

  drawSlideFooter(ctx, current, total, width, height) {
    ctx.fillStyle = '#64748b';
    ctx.font = '18px -apple-system, sans-serif';
    ctx.fillText('Dual-Screen PDF Presenter & Companion Controller', 100, height - 50);

    // Slide number pill
    const numText = `${current} / ${total}`;
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    this.roundRect(ctx, width - 200, height - 72, 100, 36, 18, true, false);
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText(numText, width - 150, height - 48);
    ctx.textAlign = 'left'; // reset
  }

  drawTitleSlide(ctx, slide, width, height) {
    // Main Title Badge
    ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 100, 260, 360, 48, 24, true, true);
    ctx.fillStyle = '#a5b4fc';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`🚀  ${slide.badge}`, 125, 292);

    // Main Large Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px -apple-system, sans-serif';
    ctx.fillText('Dual-Screen PDF', 100, 400);

    // Gradient Highlight Text
    const textGrad = ctx.createLinearGradient(100, 490, 800, 490);
    textGrad.addColorStop(0, '#38bdf8');
    textGrad.addColorStop(1, '#818cf8');
    ctx.fillStyle = textGrad;
    ctx.fillText('Presentation Cockpit', 100, 490);

    // Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '30px -apple-system, sans-serif';
    ctx.fillText(slide.subtitle, 100, 580);

    // Feature chips at bottom of title
    const chips = ['⚡ Zero-Latency Sync', '🖥️ Dual-Screen Placement', '🎛️ Bitfocus Companion API', '🔴 Laser Pointer'];
    let chipX = 100;
    chips.forEach(chip => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      this.roundRect(ctx, chipX, 680, 240, 50, 25, true, true);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '18px -apple-system, sans-serif';
      ctx.fillText(chip, chipX + 20, 712);
      chipX += 260;
    });
  }

  drawThreeCardsSlide(ctx, slide, width, height) {
    this.drawSlideHeader(ctx, slide, width, height);

    const cardWidth = 520;
    const cardHeight = 580;
    const startY = 300;
    const gap = 40;

    slide.cards.forEach((card, i) => {
      const cardX = 100 + i * (cardWidth + gap);

      // Card Background
      ctx.fillStyle = 'rgba(30, 41, 69, 0.6)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      this.roundRect(ctx, cardX, startY, cardWidth, cardHeight, 20, true, true);

      // Icon Circle
      ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
      this.roundRect(ctx, cardX + 40, startY + 40, 80, 80, 40, true, false);
      ctx.font = '40px -apple-system, sans-serif';
      ctx.fillText(card.icon, cardX + 58, startY + 96);

      // Card Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px -apple-system, sans-serif';
      ctx.fillText(card.title, cardX + 40, startY + 180);

      // Card Description (Word Wrapped)
      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px -apple-system, sans-serif';
      this.wrapText(ctx, card.desc, cardX + 40, startY + 230, cardWidth - 80, 36);
    });
  }

  drawApiShowcaseSlide(ctx, slide, width, height) {
    this.drawSlideHeader(ctx, slide, width, height);

    // Left Panel: Code / Flow Box
    const leftX = 100;
    const leftY = 300;
    const leftW = 800;
    const leftH = 580;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    this.roundRect(ctx, leftX, leftY, leftW, leftH, 16, true, true);

    // Title bar of code box
    ctx.fillStyle = '#1e293b';
    this.roundRect(ctx, leftX, leftY, leftW, 50, 16, true, false);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('📡  BITFOCUS COMPANION REST API HUB', leftX + 24, leftY + 32);

    let endY = leftY + 100;
    slide.endpoints.forEach(ep => {
      ctx.fillStyle = ep.method === 'POST' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)';
      ctx.strokeStyle = ep.method === 'POST' ? '#10b981' : '#3b82f6';
      ctx.lineWidth = 1;
      this.roundRect(ctx, leftX + 24, endY - 24, 70, 32, 6, true, true);

      ctx.fillStyle = ep.method === 'POST' ? '#34d399' : '#60a5fa';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(ep.method, leftX + 36, endY - 2);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(ep.path, leftX + 110, endY - 2);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px -apple-system, sans-serif';
      ctx.fillText(ep.desc, leftX + 110, endY + 28);

      endY += 105;
    });

    // Right Panel: Stream Deck Visual Preview
    const rightX = 950;
    const rightY = 300;
    const rightW = 870;
    const rightH = 580;

    ctx.fillStyle = 'rgba(30, 41, 69, 0.6)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, rightX, rightY, rightW, rightH, 16, true, true);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.fillText('Elgato Stream Deck / Companion LCD Keys', rightX + 40, rightY + 60);

    // Draw Mock Stream Deck Keys
    const keys = [
      { label: 'SLIDE', sub: '3 / 6', color: '#6366f1' },
      { label: 'PREV', sub: '◀ Slide', color: '#1e293b' },
      { label: 'NEXT', sub: 'Slide ▶', color: '#2563eb' },
      { label: 'BLACK', sub: 'Curtain (B)', color: '#0f172a' },
      { label: 'TIMER', sub: '04:12', color: '#059669' },
      { label: 'LASER', sub: 'Toggle (L)', color: '#dc2626' }
    ];

    keys.forEach((k, idx) => {
      const row = Math.floor(idx / 3);
      const col = idx % 3;
      const kX = rightX + 40 + col * 260;
      const kY = rightY + 110 + row * 210;

      ctx.fillStyle = k.color;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      this.roundRect(ctx, kX, kY, 230, 170, 16, true, true);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(k.label, kX + 115, kY + 80);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(k.sub, kX + 115, kY + 120);
      ctx.textAlign = 'left';
    });
  }

  drawFeatureGridSlide(ctx, slide, width, height) {
    this.drawSlideHeader(ctx, slide, width, height);

    const startX = 100;
    const startY = 300;
    const itemW = 820;
    const itemH = 260;
    const gap = 40;

    slide.features.forEach((feat, idx) => {
      const row = Math.floor(idx / 2);
      const col = idx % 2;
      const x = startX + col * (itemW + gap);
      const y = startY + row * (itemH + gap);

      ctx.fillStyle = 'rgba(30, 41, 69, 0.6)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      this.roundRect(ctx, x, y, itemW, itemH, 16, true, true);

      // Icon Circle
      ctx.font = '36px -apple-system, sans-serif';
      ctx.fillText(feat.icon, x + 30, y + 60);

      // Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px -apple-system, sans-serif';
      ctx.fillText(feat.label, x + 90, y + 55);

      // Desc
      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px -apple-system, sans-serif';
      this.wrapText(ctx, feat.desc, x + 30, y + 110, itemW - 60, 32);
    });
  }

  drawMetricsSlide(ctx, slide, width, height) {
    this.drawSlideHeader(ctx, slide, width, height);

    const startX = 100;
    const startY = 320;
    const boxW = 820;
    const boxH = 240;
    const gap = 40;

    slide.metrics.forEach((m, idx) => {
      const row = Math.floor(idx / 2);
      const col = idx % 2;
      const x = startX + col * (boxW + gap);
      const y = startY + row * (boxH + gap);

      ctx.fillStyle = 'rgba(18, 24, 41, 0.8)';
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
      ctx.lineWidth = 2;
      this.roundRect(ctx, x, y, boxW, boxH, 20, true, true);

      // Big Number Gradient
      const grad = ctx.createLinearGradient(x + 40, y + 100, x + 400, y + 100);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(1, '#818cf8');
      ctx.fillStyle = grad;
      ctx.font = 'bold 64px -apple-system, sans-serif';
      ctx.fillText(m.val, x + 40, y + 100);

      // Label
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '24px -apple-system, sans-serif';
      ctx.fillText(m.label, x + 40, y + 160);
    });
  }

  drawConclusionSlide(ctx, slide, width, height) {
    this.drawSlideHeader(ctx, slide, width, height);

    const cardX = 100;
    const cardY = 300;
    const cardW = width - 200;
    const cardH = 580;

    ctx.fillStyle = 'rgba(30, 41, 69, 0.6)';
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 20, true, true);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 36px -apple-system, sans-serif';
    ctx.fillText('Get Started in 3 Simple Steps:', cardX + 60, cardY + 80);

    let stepY = cardY + 160;
    slide.steps.forEach(step => {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px -apple-system, sans-serif';
      ctx.fillText(step, cardX + 60, stepY);
      stepY += 90;
    });

    // Pro tip box
    ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, cardX + 60, stepY + 20, cardW - 120, 80, 10, true, true);

    ctx.fillStyle = '#a5b4fc';
    ctx.font = '20px -apple-system, sans-serif';
    ctx.fillText('💡 Pro Tip: Press "G" to toggle the slide grid or "?" for the full keyboard shortcuts cheat sheet.', cardX + 90, stepY + 68);
  }

  // Canvas Helper: Rounded Rectangles
  roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Canvas Helper: Multiline text wrapper
  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }
}

window.DemoSlideDeck = DemoSlideDeck;
