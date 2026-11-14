export interface BrowserCapabilityReport {
  webgpuSupported: boolean;
  webgpuAdapterInfo: string;
  webgl2Supported: boolean;
  webgl2RendererInfo: string;
  isSoftwareRenderer: boolean;
  webCodecsVideoDecoder: boolean;
  webCodecsVideoEncoder: boolean;
  offscreenCanvasSupported: boolean;
  webWorkersSupported: boolean;
  webAssemblySupported: boolean;
  webAssemblySimdSupported: boolean;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number;
  maxTextureDimension2D: number;
}

export async function detectBrowserCapabilities(): Promise<BrowserCapabilityReport> {
  if (typeof window === 'undefined') {
    return {
      webgpuSupported: false,
      webgpuAdapterInfo: 'Server SSR',
      webgl2Supported: false,
      webgl2RendererInfo: 'Server SSR',
      isSoftwareRenderer: false,
      webCodecsVideoDecoder: false,
      webCodecsVideoEncoder: false,
      offscreenCanvasSupported: false,
      webWorkersSupported: false,
      webAssemblySupported: true,
      webAssemblySimdSupported: false,
      deviceMemoryGb: null,
      hardwareConcurrency: 4,
      maxTextureDimension2D: 4096,
    };
  }

  let webgpuSupported = false;
  let webgpuAdapterInfo = 'Unavailable in current browser';
  let maxTextureDimension2D = 4096;

  try {
    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter: ( opts?: { powerPreference?: string }) => Promise<{
          info?: { vendor?: string; architecture?: string; description?: string };
          limits?: { maxTextureDimension2D?: number };
        } | null>;
      };
    };
    if (nav.gpu && typeof nav.gpu.requestAdapter === 'function') {
      const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        webgpuSupported = true;
        const vendor = adapter.info?.vendor || 'GPU';
        const arch = adapter.info?.architecture || 'WebGPU Adapter';
        webgpuAdapterInfo = `${vendor} (${arch})`;
        if (adapter.limits?.maxTextureDimension2D) {
          maxTextureDimension2D = adapter.limits.maxTextureDimension2D;
        }
      }
    }
  } catch {
    webgpuSupported = false;
  }

  let webgl2Supported = false;
  let webgl2RendererInfo = 'Unavailable';
  let isSoftwareRenderer = false;

  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (gl) {
      webgl2Supported = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      webgl2RendererInfo = String(gl.getParameter(param) || 'WebGL2 Context');
      isSoftwareRenderer = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
        webgl2RendererInfo
      );
      if (!webgpuSupported) {
        maxTextureDimension2D = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl2Supported = false;
  }

  const webCodecsVideoDecoder = typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder === 'function';
  const webCodecsVideoEncoder = typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder === 'function';
  const offscreenCanvasSupported = typeof OffscreenCanvas !== 'undefined';
  const webWorkersSupported = typeof Worker !== 'undefined';
  const webAssemblySupported = typeof WebAssembly === 'object';

  // Detect WASM SIMD support with tiny valid WASM header probe
  let webAssemblySimdSupported = false;
  try {
    const simdProbe = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
      253, 15, 253, 98, 11,
    ]);
    webAssemblySimdSupported = WebAssembly.validate(simdProbe);
  } catch {
    webAssemblySimdSupported = false;
  }

  const navMem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;

  return {
    webgpuSupported,
    webgpuAdapterInfo,
    webgl2Supported,
    webgl2RendererInfo,
    isSoftwareRenderer,
    webCodecsVideoDecoder,
    webCodecsVideoEncoder,
    offscreenCanvasSupported,
    webWorkersSupported,
    webAssemblySupported,
    webAssemblySimdSupported,
    deviceMemoryGb: navMem,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    maxTextureDimension2D,
  };
}
