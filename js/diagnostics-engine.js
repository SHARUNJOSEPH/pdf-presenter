/**
 * js/diagnostics-engine.js
 * Hardware, GPU, Display Topology & Runtime Diagnostics Generator for PDF Presenter Suite.
 * Pinpoints root causes for slide flickering, dual-screen VSync composition tearing,
 * DPI scaling mismatches, and multi-monitor refresh rate disparities.
 */

const os = require('os');
const crypto = require('crypto');

// Rolling circular log buffer for recent runtime events
const MAX_LOG_BUFFER_SIZE = 100;
const diagnosticsLogBuffer = [];

/**
 * Strips personal user folders and confidential path fragments for privacy.
 */
function sanitizePath(p) {
  if (typeof p !== 'string') return p;
  return p
    .replace(/[a-zA-Z]:\\Users\\[^\\]+/gi, 'C:\\Users\\<REDACTED>')
    .replace(/\/Users\/[^\/]+/gi, '/Users/<REDACTED>')
    .replace(/\/home\/[^\/]+/gi, '/home/<REDACTED>');
}

/**
 * Appends a log entry to the circular in-memory buffer.
 */
function recordLog(level, message, meta = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message: sanitizePath(String(message)),
    meta: meta ? sanitizePath(typeof meta === 'object' ? JSON.stringify(meta) : String(meta)) : null
  };
  diagnosticsLogBuffer.push(entry);
  if (diagnosticsLogBuffer.length > MAX_LOG_BUFFER_SIZE) {
    diagnosticsLogBuffer.shift();
  }
}

/**
 * Returns a copy of recent recorded log entries.
 */
function getRecentLogs(limit = 50) {
  return diagnosticsLogBuffer.slice(-limit);
}

/**
 * Automated flicker and latency heuristic analysis.
 */
function analyzeFlickerPotential(displays, gpuFeatures = {}, gpuInfo = {}) {
  const warnings = [];
  const recommendations = [];

  // 1. Mixed DPI Scaling Analysis (Leading cause of Chromium/Electron slide flicker on Windows)
  if (displays && displays.length > 1) {
    const scaleFactors = displays.map(d => Number(d.scaleFactor || 1));
    const uniqueScales = [...new Set(scaleFactors)];
    if (uniqueScales.length > 1) {
      warnings.push(`Mixed DPI Scale Factors: Connected displays use different scaling factors (${uniqueScales.map(s => s + 'x').join(' vs ')}). On Windows, moving surfaces across mismatched DPI screens triggers backbuffer surface re-allocation, causing a momentary single-frame flicker during slide dissolves.`);
      recommendations.push(`Set both your primary display and external projector/monitor to 100% or 125% DPI in Windows Display Settings for seamless presentation transitions.`);
    }

    // 2. Refresh Rate Disparity & Broadcast Standard Analysis
    const refreshRates = displays.map(d => Number(d.displayFrequency || 60)).filter(f => f > 0);
    const uniqueRates = [...new Set(refreshRates)];
    
    // Check if any audience / non-primary or external display is running at broadcast standard frequencies
    const broadcastRates = [24, 25, 29, 30, 50, 59]; // 24p, 25p/PAL, 29.97/30p, 50p/50Hz EBU/PAL, 59.94/60p NTSC
    const audienceDisplays = displays.filter(d => !d.isPrimary);
    const isAudienceBroadcast = audienceDisplays.some(d => {
      const f = Math.round(Number(d.displayFrequency || 60));
      return broadcastRates.includes(f);
    });

    if (uniqueRates.length > 1) {
      if (isAudienceBroadcast) {
        // Professional AV & Broadcast environments deliberately output 50Hz (PAL/EBU), 59.94Hz, or 25Hz.
        // This is normal and intentional for SDI switchers (e.g. ATEM, Barco, Decimator, Roland).
        const audienceHz = audienceDisplays.map(d => Math.round(Number(d.displayFrequency || 60)) + 'Hz').join(', ');
        const primaryHz = displays.filter(d => d.isPrimary).map(d => Math.round(Number(d.displayFrequency || 60)) + 'Hz').join(', ');
        
        warnings.push(`Broadcast Standard Output Detected: External audience output is operating at ${audienceHz} (Live Event / Broadcast standard), while primary operator screen is running at ${primaryHz}. Windows DWM synchronizes VSync to the primary display.`);
        recommendations.push(`For broadcast-grade tear-free output at 50Hz/59.94Hz: Match your laptop screen's refresh rate to ${audienceHz} in Windows Display Settings > Advanced display, or toggle "Make this my main display" on the external screen during the show so Windows locks DWM VSync directly to the audience feed.`);
      } else {
        warnings.push(`Refresh Rate Mismatch: Displays have different refresh rates (${uniqueRates.map(r => r + 'Hz').join(' vs ')}). If an external screen or 4K TV/projector is running at 29Hz/30Hz, Windows DWM struggles to synchronize VSync with a 60Hz screen, resulting in noticeable stutter or flicker during slide changes.`);
        recommendations.push(`Set your external display to 60Hz in Windows Display Settings > Advanced Display (or lower resolution from 4K to 1440p/1080p if HDMI cable bandwidth is capping it at 30Hz/29Hz).`);
      }
    }
  }

  // 3. GPU Hardware Acceleration & Compositing
  if (gpuFeatures && typeof gpuFeatures === 'object') {
    if (gpuFeatures['gpu_compositing'] && !['enabled', 'enabled_on', 'enabled_force'].includes(gpuFeatures['gpu_compositing'])) {
      warnings.push(`GPU Compositing Status: "${gpuFeatures['gpu_compositing']}". Hardware compositing is disabled, forcing CPU software fallback which increases slide transition latency.`);
      recommendations.push(`Verify graphics driver updates or ensure hardware acceleration is enabled in Windows Graphics settings.`);
    }
    if (gpuFeatures['rasterization'] && !['enabled', 'enabled_on', 'enabled_force'].includes(gpuFeatures['rasterization'])) {
      warnings.push(`GPU Rasterization: "${gpuFeatures['rasterization']}". 2D Canvas rasterization is falling back to software emulation.`);
    }
  }

  // 4. Memory Headroom
  const freeMemMB = Math.round(os.freemem() / 1024 / 1024);
  if (freeMemMB < 800) {
    warnings.push(`Low System Memory: Only ${freeMemMB} MB of RAM is free. High-resolution PDF textures may encounter memory pressure.`);
    recommendations.push(`Close unused background applications before presenting large slide decks.`);
  }

  // Calculate Flicker Risk:
  // If the only warning is a legitimate Broadcast Standard Output, keep risk level at LOW / OPTIMAL or MODERATE (not HIGH)
  // when hardware GPU compositing is fully enabled.
  const criticalWarnings = warnings.filter(w => !w.startsWith('Broadcast Standard Output Detected:'));
  let flickerRisk = 'LOW';
  if (criticalWarnings.length >= 2) {
    flickerRisk = 'HIGH';
  } else if (criticalWarnings.length === 1) {
    flickerRisk = 'MODERATE';
  } else if (warnings.length > 0) {
    // Only broadcast standard detected with GPU acceleration healthy
    flickerRisk = 'LOW';
  }

  return {
    flickerRisk,
    warnings,
    recommendations
  };
}

/**
 * Builds the comprehensive structured diagnostic data object.
 */
function buildDiagnosticData(context = {}) {
  const {
    appVersion = '1.2.8-beta',
    isPackaged = false,
    isStore = false,
    displays = [],
    gpuFeatures = {},
    gpuInfo = {},
    activeSwitches = {},
    presentation = {}
  } = context;

  const flickerAnalysis = analyzeFlickerPotential(displays, gpuFeatures, gpuInfo);

  return {
    reportId: `PPR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    generatedAt: new Date().toISOString(),
    app: {
      name: 'PDF Presenter Suite',
      version: appVersion,
      isPackaged,
      isStore,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      v8Version: process.versions.v8,
      uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 0)
    },
    system: {
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
      cpuModel: os.cpus && os.cpus()[0] ? os.cpus()[0].model : 'Unknown CPU',
      cpuCount: os.cpus ? os.cpus().length : 1
    },
    displays: (displays || []).map((d, index) => ({
      index: index + 1,
      id: d.id,
      label: d.label || `Display ${index + 1}`,
      bounds: d.bounds ? `${d.bounds.width}x${d.bounds.height}` : 'unknown',
      scaleFactor: d.scaleFactor || 1,
      refreshRateHz: d.displayFrequency || 60,
      isPrimary: Boolean(d.isPrimary)
    })),
    gpu: {
      features: gpuFeatures,
      info: gpuInfo,
      adapters: context.gpuAdapters || []
    },
    activeSwitches: activeSwitches || {},
    presentation: {
      hasDeck: Boolean(presentation.hasDeck),
      slideCount: presentation.slideCount || 0,
      currentSlide: presentation.currentSlide || 0,
      transition: presentation.transition || 'dissolve',
      isAudienceActive: Boolean(presentation.isAudienceActive)
    },
    flickerAnalysis,
    recentLogs: getRecentLogs(30)
  };
}

/**
 * Formats diagnostic data into clean GitHub-flavored Markdown.
 */
function formatMarkdownReport(diag) {
  const lines = [];

  lines.push(`# 📽️ PDF Presenter Suite — Diagnostic Bug Report`);
  lines.push(`> **Report ID:** \`${diag.reportId}\` • **Generated:** \`${diag.generatedAt}\``);
  lines.push(``);

  lines.push(`## 📌 Application & Environment`);
  lines.push(`- **App Version:** \`v${diag.app.version}\` (${diag.app.isPackaged ? 'Packaged' : 'Dev'} • ${diag.app.isStore ? 'Microsoft Store' : 'Standalone'})`);
  lines.push(`- **Operating System:** \`${diag.system.type} ${diag.system.release} (${diag.system.arch})\``);
  lines.push(`- **CPU / Cores:** \`${diag.system.cpuModel} (${diag.system.cpuCount} cores)\``);
  lines.push(`- **Memory (RAM):** \`${diag.system.totalMemoryMB} MB Total\` (\`${diag.system.freeMemoryMB} MB Free\`)`);
  lines.push(`- **Runtimes:** Electron \`${diag.app.electronVersion}\` • Chromium \`${diag.app.chromeVersion}\` • Node.js \`${diag.app.nodeVersion}\``);
  lines.push(``);

  lines.push(`## ⚡ Slide Flicker & Hardware Analysis`);
  const riskEmoji = diag.flickerAnalysis.flickerRisk === 'HIGH' ? '🔴' : (diag.flickerAnalysis.flickerRisk === 'MODERATE' ? '🟡' : '🟢');
  lines.push(`- **Flicker Risk Level:** ${riskEmoji} **${diag.flickerAnalysis.flickerRisk}**`);
  if (diag.flickerAnalysis.warnings.length > 0) {
    lines.push(`### Identified Warnings:`);
    for (const w of diag.flickerAnalysis.warnings) {
      lines.push(`- ⚠️ ${w}`);
    }
  } else {
    lines.push(`- ✅ No common hardware composition conflicts detected.`);
  }

  if (diag.flickerAnalysis.recommendations.length > 0) {
    lines.push(`### Recommended Optimizations:`);
    for (const r of diag.flickerAnalysis.recommendations) {
      lines.push(`- 💡 ${r}`);
    }
  }
  lines.push(``);

  lines.push(`## 🖥️ Connected Displays (${diag.displays.length})`);
  if (diag.displays.length === 0) {
    lines.push(`- *No display metrics captured.*`);
  } else {
    for (const d of diag.displays) {
      lines.push(`- **${d.label}:** \`${d.bounds}\` @ \`${d.scaleFactor}x DPI\` (\`${d.refreshRateHz}Hz\`) ${d.isPrimary ? '[Primary Screen]' : '[Audience / Projector]'}`);
    }
  }
  lines.push(``);

  lines.push(`## 🎮 Graphics Hardware & GPU Adapters`);
  if (diag.gpu && diag.gpu.adapters && diag.gpu.adapters.length > 0) {
    for (const gpu of diag.gpu.adapters) {
      const vramMB = gpu.AdapterRAM ? Math.round(Number(gpu.AdapterRAM) / (1024 * 1024)) : 0;
      const vramStr = vramMB > 0 ? ` (${vramMB} MB VRAM)` : '';
      lines.push(`- **${gpu.Name || 'Graphics Device'}:** Driver \`${gpu.DriverVersion || 'Unknown'}\`${vramStr}`);
    }
  } else {
    lines.push(`- *GPU hardware adapter enumeration completed.*`);
  }
  lines.push(``);

  lines.push(`## ⚙️ GPU Acceleration & Compositor Features`);
  if (diag.gpu.features && typeof diag.gpu.features === 'object') {
    for (const [key, val] of Object.entries(diag.gpu.features)) {
      lines.push(`- **${key}:** \`${val}\``);
    }
  } else {
    lines.push(`- *GPU feature status unavailable.*`);
  }
  lines.push(``);

  lines.push(`## 📄 Presentation State`);
  lines.push(`- **Presentation Deck Loaded:** \`${diag.presentation.hasDeck ? 'Yes' : 'No'}\``);
  if (diag.presentation.hasDeck) {
    lines.push(`- **Total Slides:** \`${diag.presentation.slideCount}\``);
    lines.push(`- **Current Slide:** \`${diag.presentation.currentSlide}\``);
  }
  lines.push(`- **Active Transition Mode:** \`${diag.presentation.transition}\``);
  lines.push(`- **Audience Screen State:** \`${diag.presentation.isAudienceActive ? 'Active' : 'Standby'}\``);
  lines.push(``);

  lines.push(`## 📋 Recent Application Logs (Last ${diag.recentLogs.length})`);
  if (diag.recentLogs.length === 0) {
    lines.push(`- *No recent runtime warnings or events logged.*`);
  } else {
    lines.push('```text');
    for (const log of diag.recentLogs) {
      const meta = log.meta ? ` | ${log.meta}` : '';
      lines.push(`[${log.timestamp}] [${log.level}] ${log.message}${meta}`);
    }
    lines.push('```');
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(`*Generated natively by PDF Presenter Suite Diagnostics Engine.*`);

  return lines.join('\n');
}

module.exports = {
  sanitizePath,
  recordLog,
  getRecentLogs,
  analyzeFlickerPotential,
  buildDiagnosticData,
  formatMarkdownReport
};
