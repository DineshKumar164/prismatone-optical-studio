import { PRISMATONE_WGSL_SHADER } from '../shaders/optical-pipeline.wgsl';
import {
  PRISMATONE_WEBGL2_VERTEX_SHADER,
  PRISMATONE_WEBGL2_FRAGMENT_SHADER,
} from '../shaders/optical-pipeline.glsl';
import {
  FLARE_QUAD_VERTEX_SHADER,
  FLARE_BRIGHT_EXTRACT_FRAGMENT_SHADER,
  FLARE_KAWASE_STREAK_FRAGMENT_SHADER,
  FLARE_ASSEMBLE_FRAGMENT_SHADER,
  computeBeerLambertStreakAttenuation,
} from '../shaders/optical-flare-multipass.glsl';

export type ActiveRenderBackend = 'webgpu' | 'webgl2' | 'canvas2d-fallback';

export interface EngineTelemetry {
  activeBackend: ActiveRenderBackend;
  lastFrameTimeMs: number;
  fpsEstimate: number;
  deviceLostCount: number;
  lastRecoveryStatus: string;
  shaderCompiled: boolean;
}

interface GlFboTarget {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

interface GlFlarePipeline {
  ready: boolean;
  useHdrEncoding: boolean;
  brightProg: WebGLProgram;
  kawaseProg: WebGLProgram;
  assembleProg: WebGLProgram;
  brightLocs: {
    sourceTex: WebGLUniformLocation | null;
    data: WebGLUniformLocation | null;
    passParams: WebGLUniformLocation | null;
  };
  kawaseLocs: {
    inputTex: WebGLUniformLocation | null;
    passParams: WebGLUniformLocation | null;
    streakParams: WebGLUniformLocation | null;
    attenRgb: WebGLUniformLocation | null;
  };
  assembleLocs: {
    brightTex: WebGLUniformLocation | null;
    bloomTex: WebGLUniformLocation | null;
    wingRTex: WebGLUniformLocation | null;
    wingLTex: WebGLUniformLocation | null;
    data: WebGLUniformLocation | null;
    passParams: WebGLUniformLocation | null;
  };
  fboBright: GlFboTarget;
  fboBloomA: GlFboTarget;
  fboBloomB: GlFboTarget;
  fboSoftA: GlFboTarget;
  fboSoftB: GlFboTarget;
  fboStreakA: GlFboTarget;
  fboStreakB: GlFboTarget;
  fboWingR: GlFboTarget;
  fboWingL: GlFboTarget;
  fboAssemble: GlFboTarget;
}

/**
 * Modular GPU Simulation Engine supporting WebGPU (WGSL) as primary path
 * with automatic or user-selectable WebGL2 (GLSL 300 es) fallback, multi-pass FBO optical flare pyramid,
 * and device loss recovery.
 */
export class PrismatoneGpuEngine {
  private canvas: HTMLCanvasElement;
  private preferredBackend: 'auto' | 'webgpu' | 'webgl2' = 'auto';
  private activeBackend: ActiveRenderBackend = 'webgl2';

  // WebGPU state
  private gpuDevice: any = null;
  private gpuContext: any = null;
  private gpuPipeline: any = null;
  private gpuUniformBuffer: any = null;
  private gpuSampler: any = null;
  private gpuTexture: any = null;
  private gpuBindGroup: any = null;
  private gpuTexWidth = 0;
  private gpuTexHeight = 0;

  // WebGL2 state
  private gl: WebGL2RenderingContext | null = null;
  private glProgram: WebGLProgram | null = null;
  private glTexture: WebGLTexture | null = null;
  private glUniformLoc: WebGLUniformLocation | null = null;
  private glTexLoc: WebGLUniformLocation | null = null;
  private glFlareTexLoc: WebGLUniformLocation | null = null;
  private glFlareMetaLoc: WebGLUniformLocation | null = null;
  private glVao: WebGLVertexArrayObject | null = null;
  private glFlarePipeline: GlFlarePipeline | null = null;

  // Telemetry & device loss recovery
  private isInitialized = false;
  private lastFrameTimeMs = 2.4;
  private deviceLostCount = 0;
  private lastRecoveryStatus = 'Nominal';
  private shaderCompiled = false;
  private onStatusChange?: (telemetry: EngineTelemetry) => void;

  constructor(canvas: HTMLCanvasElement, onStatusChange?: (telemetry: EngineTelemetry) => void) {
    this.canvas = canvas;
    this.onStatusChange = onStatusChange;
  }

  public async initialize(preferred: 'auto' | 'webgpu' | 'webgl2' = 'auto'): Promise<ActiveRenderBackend> {
    this.preferredBackend = preferred;
    this.isInitialized = false;

    // Prefer WebGL2 in 'auto' mode because it runs the full 5-stage multi-pass HDR FBO optical
    // flare pyramid (Karis bright-pass -> separable Gaussian defocus -> 4-pass Radix-4 Kawase
    // Beer-Lambert streaks -> out-of-focus bokeh ghosts -> continuous separable diffusion).
    // Explicit 'webgpu' remains selectable and falls back cleanly if unavailable.
    if (preferred === 'webgpu') {
      const ok = await this.tryInitWebGPU();
      if (ok) {
        this.activeBackend = 'webgpu';
        this.shaderCompiled = true;
        this.isInitialized = true;
        this.emitTelemetry();
        return 'webgpu';
      }
    }

    const glOk = this.tryInitWebGL2();
    if (glOk) {
      this.activeBackend = 'webgl2';
      this.shaderCompiled = true;
      this.isInitialized = true;
      this.emitTelemetry();
      return 'webgl2';
    }

    if (preferred === 'auto') {
      const ok = await this.tryInitWebGPU();
      if (ok) {
        this.activeBackend = 'webgpu';
        this.shaderCompiled = true;
        this.isInitialized = true;
        this.emitTelemetry();
        return 'webgpu';
      }
    }

    this.activeBackend = 'canvas2d-fallback';
    this.shaderCompiled = false;
    this.isInitialized = true;
    this.emitTelemetry();
    return 'canvas2d-fallback';
  }

  private async tryInitWebGPU(): Promise<boolean> {
    try {
      const nav = navigator as any;
      if (!nav.gpu) return false;

      const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return false;

      const device = await adapter.requestDevice();
      if (!device) return false;

      // Handle WebGPU device loss & automatic recovery
      device.lost.then((info: { reason?: string; message?: string }) => {
        this.deviceLostCount += 1;
        this.lastRecoveryStatus = `Recovered from WebGPU device loss (${info.reason || 'destroyed'})`;
        this.tryInitWebGPU().then((recovered) => {
          if (!recovered) {
            this.tryInitWebGL2();
            this.activeBackend = 'webgl2';
          }
          this.emitTelemetry();
        });
      });

      const format = nav.gpu.getPreferredCanvasFormat();

      const shaderModule = device.createShaderModule({
        label: 'Prismatone Optical WGSL Shader',
        code: PRISMATONE_WGSL_SHADER,
      });

      if (typeof shaderModule.getCompilationInfo === 'function') {
        const compInfo = await shaderModule.getCompilationInfo();
        const compileErrors = (compInfo.messages || []).filter(
          (m: { type?: string }) => m.type === 'error'
        );
        if (compileErrors.length > 0) {
          console.warn('WGSL shader compilation failed, falling back to WebGL2:', compileErrors);
          return false;
        }
      }

      if (typeof device.pushErrorScope === 'function') {
        device.pushErrorScope('validation');
      }

      const pipeline = device.createRenderPipeline({
        label: 'Prismatone Optical Render Pipeline',
        layout: 'auto',
        vertex: {
          module: shaderModule,
          entryPoint: 'vs_main',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_main',
          targets: [{ format }],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });

      if (typeof device.popErrorScope === 'function') {
        const validationErr = await device.popErrorScope();
        if (validationErr) {
          console.warn('WebGPU render pipeline validation failed, falling back to WebGL2:', validationErr);
          return false;
        }
      }

      const context = this.canvas.getContext('webgpu') as unknown;
      if (!context) return false;

      (context as any).configure({
        device,
        format,
        alphaMode: 'premultiplied',
      });

      // 128 floats = 512 bytes (32 vec4s) for optical geometry + spectral reconstruction + lens ghosting LUT
      const uniformBuffer = device.createBuffer({
        size: 512,
        usage: 0x0040 | 0x0008, // GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });

      this.gpuDevice = device;
      this.gpuContext = context;
      this.gpuPipeline = pipeline;
      this.gpuUniformBuffer = uniformBuffer;
      this.gpuSampler = sampler;
      this.gpuTexture = null;
      this.gpuBindGroup = null;

      return true;
    } catch (err) {
      console.warn('WebGPU initialization skipped, falling back to WebGL2:', err);
      return false;
    }
  }

  private tryInitWebGL2(): boolean {
    try {
      const gl = this.canvas.getContext('webgl2', {
        antialias: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      if (!gl) return false;

      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.deviceLostCount += 1;
        this.lastRecoveryStatus = 'WebGL2 context lost — awaiting restoration';
        this.emitTelemetry();
      });

      this.canvas.addEventListener('webglcontextrestored', () => {
        this.lastRecoveryStatus = 'WebGL2 context restored and shaders recompiled';
        this.tryInitWebGL2();
        this.emitTelemetry();
      });

      const program = this.linkGlProgram(
        gl,
        PRISMATONE_WEBGL2_VERTEX_SHADER,
        PRISMATONE_WEBGL2_FRAGMENT_SHADER
      );
      if (!program) return false;

      const vao = gl.createVertexArray();
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Initialize with 1x1 neutral pixel so texture is immediately valid
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([18, 22, 32, 255])
      );

      this.gl = gl;
      this.glProgram = program;
      this.glVao = vao;
      this.glTexture = tex;
      this.glUniformLoc = gl.getUniformLocation(program, 'u_data');
      this.glTexLoc = gl.getUniformLocation(program, 'u_sourceTex');
      this.glFlareTexLoc = gl.getUniformLocation(program, 'u_flareTex');
      this.glFlareMetaLoc = gl.getUniformLocation(program, 'u_flareMeta');

      // Initialize cinema multi-pass FBO optical flare pipeline
      this.glFlarePipeline = this.initGlFlarePipeline(gl);

      return true;
    } catch (err) {
      console.error('WebGL2 fallback init error:', err);
      return false;
    }
  }

  private linkGlProgram(
    gl: WebGL2RenderingContext,
    vsSource: string,
    fsSource: string
  ): WebGLProgram | null {
    const vs = this.compileGlShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = this.compileGlShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('WebGL2 program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  private createGlFboTarget(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    useFloat16: boolean
  ): GlFboTarget | null {
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    if (useFloat16) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(fbo);
      return null;
    }

    return { fbo, texture, width, height };
  }

  private initGlFlarePipeline(gl: WebGL2RenderingContext): GlFlarePipeline | null {
    try {
      const brightProg = this.linkGlProgram(
        gl,
        FLARE_QUAD_VERTEX_SHADER,
        FLARE_BRIGHT_EXTRACT_FRAGMENT_SHADER
      );
      const kawaseProg = this.linkGlProgram(
        gl,
        FLARE_QUAD_VERTEX_SHADER,
        FLARE_KAWASE_STREAK_FRAGMENT_SHADER
      );
      const assembleProg = this.linkGlProgram(
        gl,
        FLARE_QUAD_VERTEX_SHADER,
        FLARE_ASSEMBLE_FRAGMENT_SHADER
      );
      if (!brightProg || !kawaseProg || !assembleProg) return null;

      // Prefer native RGBA16F linear HDR FBOs when color_buffer_float/half_float is available;
      // otherwise seamlessly use RGBA8 with Reinhard HDR encoding
      const hasFloatColorBuffer =
        Boolean(gl.getExtension('EXT_color_buffer_float')) ||
        Boolean(gl.getExtension('EXT_color_buffer_half_float'));

      let useFloat16 = hasFloatColorBuffer;
      const FLARE_W = 512;
      const FLARE_H = 288;
      const BLOOM_W = 256;
      const BLOOM_H = 144;
      const SOFT_W = 128;
      const SOFT_H = 72;

      let fboBright = this.createGlFboTarget(gl, FLARE_W, FLARE_H, useFloat16);
      if (!fboBright && useFloat16) {
        useFloat16 = false;
        fboBright = this.createGlFboTarget(gl, FLARE_W, FLARE_H, false);
      }
      if (!fboBright) return null;

      const fboBloomA = this.createGlFboTarget(gl, BLOOM_W, BLOOM_H, useFloat16);
      const fboBloomB = this.createGlFboTarget(gl, BLOOM_W, BLOOM_H, useFloat16);
      const fboSoftA = this.createGlFboTarget(gl, SOFT_W, SOFT_H, useFloat16);
      const fboSoftB = this.createGlFboTarget(gl, SOFT_W, SOFT_H, useFloat16);
      const fboStreakA = this.createGlFboTarget(gl, FLARE_W, FLARE_H, useFloat16);
      const fboStreakB = this.createGlFboTarget(gl, FLARE_W, FLARE_H, useFloat16);
      const fboWingR = this.createGlFboTarget(gl, FLARE_W, FLARE_H, useFloat16);
      const fboWingL = this.createGlFboTarget(gl, FLARE_W, FLARE_H, useFloat16);
      const fboAssemble = this.createGlFboTarget(gl, FLARE_W, FLARE_H, useFloat16);

      if (
        !fboBloomA ||
        !fboBloomB ||
        !fboSoftA ||
        !fboSoftB ||
        !fboStreakA ||
        !fboStreakB ||
        !fboWingR ||
        !fboWingL ||
        !fboAssemble
      ) {
        return null;
      }

      return {
        ready: true,
        useHdrEncoding: !useFloat16,
        brightProg,
        kawaseProg,
        assembleProg,
        brightLocs: {
          sourceTex: gl.getUniformLocation(brightProg, 'u_sourceTex'),
          data: gl.getUniformLocation(brightProg, 'u_data'),
          passParams: gl.getUniformLocation(brightProg, 'u_passParams'),
        },
        kawaseLocs: {
          inputTex: gl.getUniformLocation(kawaseProg, 'u_inputTex'),
          passParams: gl.getUniformLocation(kawaseProg, 'u_passParams'),
          streakParams: gl.getUniformLocation(kawaseProg, 'u_streakParams'),
          attenRgb: gl.getUniformLocation(kawaseProg, 'u_attenRgb'),
        },
        assembleLocs: {
          brightTex: gl.getUniformLocation(assembleProg, 'u_brightTex'),
          bloomTex: gl.getUniformLocation(assembleProg, 'u_bloomTex'),
          wingRTex: gl.getUniformLocation(assembleProg, 'u_wingRTex'),
          wingLTex: gl.getUniformLocation(assembleProg, 'u_wingLTex'),
          data: gl.getUniformLocation(assembleProg, 'u_data'),
          passParams: gl.getUniformLocation(assembleProg, 'u_passParams'),
        },
        fboBright,
        fboBloomA,
        fboBloomB,
        fboSoftA,
        fboSoftB,
        fboStreakA,
        fboStreakB,
        fboWingR,
        fboWingL,
        fboAssemble,
      };
    } catch (err) {
      console.warn('Multi-pass optical flare FBO init skipped, falling back to inline flare:', err);
      return null;
    }
  }

  private runGlOpticalFlarePasses(gl: WebGL2RenderingContext, uniformData: Float32Array): boolean {
    const fp = this.glFlarePipeline;
    if (!fp || !fp.ready || !this.glTexture) return false;

    const flareIntensity = uniformData[16] ?? 0; // u_data[4].x
    const veilingGlare = uniformData[53] ?? 0;   // u_data[13].y
    if (flareIntensity < 0.005 && veilingGlare < 0.005) {
      return false;
    }

    const canvasAspect = Math.max(0.5, this.canvas.width / Math.max(1, this.canvas.height));
    const useHdrFlag = fp.useHdrEncoding ? 1.0 : 0.0;
    const squeeze = Math.max(1.0, uniformData[7] ?? 1.0); // u_data[1].w
    const irisBlades = Math.max(5.0, Math.floor((uniformData[49] ?? 9.0) + 0.0001)); // floor(u_data[12].y)
    const tintRgb: [number, number, number] = [
      Math.max(0.04, uniformData[20] ?? 0.2),  // u_data[5].x
      Math.max(0.04, uniformData[21] ?? 0.55), // u_data[5].y
      Math.max(0.04, uniformData[22] ?? 1.0),  // u_data[5].z
    ];
    const lightX = uniformData[77] ?? 0.72; // u_data[19].y
    const lightY = uniformData[78] ?? 0.28; // u_data[19].z
    const isDefaultAngle = Math.hypot(lightX - 0.72, lightY - 0.28) < 0.015;
    // Note: FBO Y-axis points UP, while screen UV Y points DOWN, so negate angle for FBO space
    const streakRad = isDefaultAngle ? 0.0 : -Math.atan2(lightY - 0.5, lightX - 0.5);

    gl.bindVertexArray(this.glVao);

    // Explicitly unbind auxiliary texture units 1..3 before FBO passes so no previous-frame
    // render target (fboAssemble, fboWingR, fboWingL) remains bound during framebuffer writes
    // (prevents silent WebGL2 feedback-loop blackout on Frame 2+ of Live Camera on ANGLE/Metal/D3D11)
    for (let unit = 1; unit <= 3; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.activeTexture(gl.TEXTURE0);

    // -------------------------------------------------------------------------
    // PASS 1: 9-tap Smooth Tent Linear HDR Specular Bright-Pass (512x288)
    // -------------------------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, fp.fboBright.fbo);
    gl.viewport(0, 0, fp.fboBright.width, fp.fboBright.height);
    gl.useProgram(fp.brightProg);
    if (fp.brightLocs.data) {
      gl.uniform4fv(fp.brightLocs.data, uniformData.subarray(0, 128));
    }
    if (fp.brightLocs.passParams) {
      gl.uniform4f(
        fp.brightLocs.passParams,
        1.0 / fp.fboBright.width,
        1.0 / fp.fboBright.height,
        useHdrFlag,
        canvasAspect
      );
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.glTexture);
    if (fp.brightLocs.sourceTex) {
      gl.uniform1i(fp.brightLocs.sourceTex, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Helper for Kawase / Bloom / Starburst passes
    const drawKawase = (
      srcTex: WebGLTexture,
      dst: GlFboTarget,
      mode: number,
      p0: number,
      p1: number,
      stride: number,
      p3: number,
      ar: number,
      ag: number,
      ab: number,
      gain: number
    ) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.width, dst.height);
      gl.useProgram(fp.kawaseProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      if (fp.kawaseLocs.inputTex) gl.uniform1i(fp.kawaseLocs.inputTex, 0);
      if (fp.kawaseLocs.passParams) {
        gl.uniform4f(fp.kawaseLocs.passParams, 1.0 / dst.width, 1.0 / dst.height, useHdrFlag, mode);
      }
      if (fp.kawaseLocs.streakParams) {
        gl.uniform4f(fp.kawaseLocs.streakParams, p0, p1, stride, p3);
      }
      if (fp.kawaseLocs.attenRgb) {
        gl.uniform4f(fp.kawaseLocs.attenRgb, ar, ag, ab, gain);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    // -------------------------------------------------------------------------
    // PASS 2: Continuous Separable 9-Tap Gaussian Optical Defocus Pyramid (256x144 -> 128x72)
    // Mode 1.0 = Horizontal 9-tap Gaussian, Mode 3.0 = Vertical 9-tap Gaussian (step <= 1.35 texels)
    // 100% mathematically continuous — zero sparse-tap dots, zero grid, pure velvety optical bokeh
    // -------------------------------------------------------------------------
    drawKawase(fp.fboBright.texture, fp.fboBloomA, 1.0, 0, 0, 1.25, 0, 1, 1, 1, 1.0);
    drawKawase(fp.fboBloomA.texture, fp.fboBloomB, 3.0, 0, 0, 1.25, 0, 1, 1, 1, 1.0);

    // 2 full continuous H+V separable Gaussian cascades at 128x72 for ultra-blurry lens ghosts & veiling glow
    drawKawase(fp.fboBloomB.texture, fp.fboSoftA, 1.0, 0, 0, 1.25, 0, 1, 1, 1, 1.0);
    drawKawase(fp.fboSoftA.texture, fp.fboSoftB, 3.0, 0, 0, 1.25, 0, 1, 1, 1, 1.0);
    drawKawase(fp.fboSoftB.texture, fp.fboSoftA, 1.0, 0, 0, 1.35, 0, 1, 1, 1, 1.0);
    drawKawase(fp.fboSoftA.texture, fp.fboSoftB, 3.0, 0, 0, 1.35, 0, 1, 1, 1, 1.0);

    // -------------------------------------------------------------------------
    // PASS 3: Continuous Anamorphic Kawase Beer-Lambert Streaks OR Diffused Spherical Starburst
    // Fed from horizontally pre-softened fboBloomA (256x144) so beams stay sleek, velvety, and non-bloated
    // -------------------------------------------------------------------------
    const isAnamorphic = squeeze > 1.08;
    if (isAnamorphic) {
      const [attR, attG, attB] = computeBeerLambertStreakAttenuation(tintRgb, squeeze);
      const dirX = Math.cos(streakRad);
      const dirY = Math.sin(streakRad) * canvasAspect;

      // Right wing (+axisDir): exact 4-pass radix-4 continuous exponential propagation
      drawKawase(fp.fboBloomA.texture, fp.fboStreakA, 0.0, dirX, dirY, 1.0, 1.0, attR, attG, attB, 0.38);
      drawKawase(fp.fboStreakA.texture, fp.fboStreakB, 0.0, dirX, dirY, 4.0, 0.65, attR, attG, attB, 0.50);
      drawKawase(fp.fboStreakB.texture, fp.fboStreakA, 0.0, dirX, dirY, 16.0, 0.35, attR, attG, attB, 0.62);
      drawKawase(fp.fboStreakA.texture, fp.fboWingR, 0.0, dirX, dirY, 64.0, 0.0, attR, attG, attB, 0.74);

      // Left wing (-axisDir): exact 4-pass radix-4 continuous exponential propagation
      drawKawase(fp.fboBloomA.texture, fp.fboStreakA, 0.0, -dirX, -dirY, 1.0, 1.0, attR, attG, attB, 0.38);
      drawKawase(fp.fboStreakA.texture, fp.fboStreakB, 0.0, -dirX, -dirY, 4.0, 0.65, attR, attG, attB, 0.50);
      drawKawase(fp.fboStreakB.texture, fp.fboStreakA, 0.0, -dirX, -dirY, 16.0, 0.35, attR, attG, attB, 0.62);
      drawKawase(fp.fboStreakA.texture, fp.fboWingL, 0.0, -dirX, -dirY, 64.0, 0.0, attR, attG, attB, 0.74);
    } else {
      // Spherical 1x: Soft diffused Fraunhofer RGB-dispersed iris diffraction starburst from pre-blurred bloom
      const rayPairs = (irisBlades >= 7.5 && irisBlades <= 9.5) || irisBlades >= 15.5 ? 4.0 : 3.0;
      const baseAngle = streakRad + 0.26179938;
      drawKawase(fp.fboBloomB.texture, fp.fboWingR, 2.0, baseAngle, rayPairs, 1.35, canvasAspect, 1, 1, 1, 0.28);
    }

    // -------------------------------------------------------------------------
    // PASS 4: Optical Flare Buffer Assembly (using exclusively pre-blurred halo & ultra-soft 128x72 ghosts)
    // -------------------------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, fp.fboAssemble.fbo);
    gl.viewport(0, 0, fp.fboAssemble.width, fp.fboAssemble.height);
    gl.useProgram(fp.assembleProg);
    if (fp.assembleLocs.data) {
      gl.uniform4fv(fp.assembleLocs.data, uniformData.subarray(0, 128));
    }
    if (fp.assembleLocs.passParams) {
      gl.uniform4f(
        fp.assembleLocs.passParams,
        1.0 / fp.fboAssemble.width,
        1.0 / fp.fboAssemble.height,
        useHdrFlag,
        canvasAspect
      );
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fp.fboBloomB.texture);
    if (fp.assembleLocs.brightTex) gl.uniform1i(fp.assembleLocs.brightTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fp.fboSoftB.texture);
    if (fp.assembleLocs.bloomTex) gl.uniform1i(fp.assembleLocs.bloomTex, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fp.fboWingR.texture);
    if (fp.assembleLocs.wingRTex) gl.uniform1i(fp.assembleLocs.wingRTex, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, isAnamorphic ? fp.fboWingL.texture : fp.fboSoftB.texture);
    if (fp.assembleLocs.wingLTex) gl.uniform1i(fp.assembleLocs.wingLTex, 3);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Unbind Pass 4 auxiliary samplers before Pass 5 writes back to fboStreakA / fboAssemble
    for (let unit = 1; unit <= 3; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.activeTexture(gl.TEXTURE0);

    // -------------------------------------------------------------------------
    // PASS 5: Final Continuous Separable H+V Optical Gaussian Diffusion on Assembled Flare Field
    // Produces silky, dreamy, blurry cinema glass light with graceful optical waist and ZERO dots/chains
    // -------------------------------------------------------------------------
    drawKawase(fp.fboAssemble.texture, fp.fboStreakA, 1.0, 0, 0, 1.25, 0, 1, 1, 1, 0.99);
    drawKawase(fp.fboStreakA.texture, fp.fboAssemble, 3.0, 0, 0, 1.15, 0, 1, 1, 1, 0.99);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  private compileGlShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('GLSL compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Uploads an image, video frame, or offscreen canvas into the active GPU texture.
   */
  public uploadSourceMedia(
    source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
    width: number,
    height: number
  ): void {
    if (!this.isInitialized || width <= 0 || height <= 0) return;

    if (this.activeBackend === 'webgpu' && this.gpuDevice) {
      try {
        if (!this.gpuTexture || this.gpuTexWidth !== width || this.gpuTexHeight !== height) {
          if (this.gpuTexture) {
            this.gpuTexture.destroy();
          }
          this.gpuTexture = this.gpuDevice.createTexture({
            size: [width, height, 1],
            format: 'rgba8unorm',
            usage: 0x0004 | 0x0002 | 0x0010, // TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT
          });
          this.gpuTexWidth = width;
          this.gpuTexHeight = height;

          this.gpuBindGroup = this.gpuDevice.createBindGroup({
            layout: this.gpuPipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: this.gpuUniformBuffer } },
              { binding: 1, resource: this.gpuSampler },
              { binding: 2, resource: this.gpuTexture.createView() },
            ],
          });
        }

        this.gpuDevice.queue.copyExternalImageToTexture(
          { source },
          { texture: this.gpuTexture },
          [width, height]
        );
      } catch (err) {
        console.warn('WebGPU texture upload error:', err);
      }
      return;
    }

    if (this.activeBackend === 'webgl2' && this.gl && this.glTexture) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.glTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
  }

  /**
   * Renders a single frame through the active GPU optical pipeline using the 128-float uniform array.
   */
  public renderFrame(uniformData: Float32Array, fallbackSource?: CanvasImageSource): number {
    if (!this.isInitialized) return this.lastFrameTimeMs;
    const t0 = performance.now();

    if (this.activeBackend === 'webgpu' && this.gpuDevice && this.gpuContext && this.gpuBindGroup) {
      try {
        this.gpuDevice.queue.writeBuffer(
          this.gpuUniformBuffer,
          0,
          uniformData.buffer,
          uniformData.byteOffset,
          512
        );

        const commandEncoder = this.gpuDevice.createCommandEncoder();
        const textureView = this.gpuContext.getCurrentTexture().createView();

        const passEncoder = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: textureView,
              clearValue: { r: 0.03, g: 0.03, b: 0.05, a: 1.0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });

        passEncoder.setPipeline(this.gpuPipeline);
        passEncoder.setBindGroup(0, this.gpuBindGroup);
        passEncoder.draw(6, 1, 0, 0);
        passEncoder.end();

        this.gpuDevice.queue.submit([commandEncoder.finish()]);
      } catch (err) {
        console.warn('WebGPU render pass error:', err);
      }
    } else if (this.activeBackend === 'webgl2' && this.gl && this.glProgram) {
      const gl = this.gl;

      // Execute multi-pass HDR Kawase optical flare pyramid before final cinema composite
      const usedMultiPassFlare = this.runGlOpticalFlarePasses(gl, uniformData);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.03, 0.03, 0.05, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(this.glProgram);
      gl.bindVertexArray(this.glVao);

      if (this.glUniformLoc) {
        gl.uniform4fv(this.glUniformLoc, uniformData.subarray(0, 128));
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.glTexture);
      if (this.glTexLoc) {
        gl.uniform1i(this.glTexLoc, 0);
      }

      if (usedMultiPassFlare && this.glFlarePipeline) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.glFlarePipeline.fboAssemble.texture);
        if (this.glFlareTexLoc) {
          gl.uniform1i(this.glFlareTexLoc, 1);
        }
        if (this.glFlareMetaLoc) {
          gl.uniform4f(
            this.glFlareMetaLoc,
            1.0,
            this.glFlarePipeline.useHdrEncoding ? 1.0 : 0.0,
            0.0,
            0.0
          );
        }
      } else {
        if (this.glFlareMetaLoc) {
          gl.uniform4f(this.glFlareMetaLoc, 0.0, 0.0, 0.0, 0.0);
        }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else if (this.activeBackend === 'canvas2d-fallback' && fallbackSource) {
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(fallbackSource, 0, 0, this.canvas.width, this.canvas.height);
      }
    }

    const elapsed = performance.now() - t0;
    this.lastFrameTimeMs = Number((this.lastFrameTimeMs * 0.8 + elapsed * 0.2).toFixed(2));
    return this.lastFrameTimeMs;
  }

  /**
   * Simulates a GPU device loss event and runs automatic pipeline recovery.
   */
  public async simulateDeviceLossAndRecover(): Promise<EngineTelemetry> {
    this.deviceLostCount += 1;
    this.lastRecoveryStatus = 'Simulated GPU device loss — rebuilding shader pipeline & uniform bindings...';
    this.emitTelemetry();

    if (this.activeBackend === 'webgpu' && this.gpuDevice) {
      try {
        this.gpuDevice.destroy();
      } catch {
        // Ignore
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 140));
    await this.initialize(this.preferredBackend);
    this.lastRecoveryStatus = `Pipeline recovered on ${this.activeBackend.toUpperCase()} (Loss count: ${this.deviceLostCount})`;
    this.emitTelemetry();
    return this.getTelemetry();
  }

  public getTelemetry(): EngineTelemetry {
    return {
      activeBackend: this.activeBackend,
      lastFrameTimeMs: this.lastFrameTimeMs,
      fpsEstimate: Math.min(120, Math.round(1000 / Math.max(1.2, this.lastFrameTimeMs))),
      deviceLostCount: this.deviceLostCount,
      lastRecoveryStatus: this.lastRecoveryStatus,
      shaderCompiled: this.shaderCompiled,
    };
  }

  private emitTelemetry(): void {
    if (this.onStatusChange) {
      this.onStatusChange(this.getTelemetry());
    }
  }

  private disposeFboTarget(gl: WebGL2RenderingContext, target: GlFboTarget): void {
    gl.deleteFramebuffer(target.fbo);
    gl.deleteTexture(target.texture);
  }

  public dispose(): void {
    if (this.gpuTexture) {
      try {
        this.gpuTexture.destroy();
      } catch {
        // Ignore
      }
    }
    if (this.gpuUniformBuffer) {
      try {
        this.gpuUniformBuffer.destroy();
      } catch {
        // Ignore
      }
    }
    if (this.gl) {
      if (this.glFlarePipeline) {
        const fp = this.glFlarePipeline;
        this.gl.deleteProgram(fp.brightProg);
        this.gl.deleteProgram(fp.kawaseProg);
        this.gl.deleteProgram(fp.assembleProg);
        this.disposeFboTarget(this.gl, fp.fboBright);
        this.disposeFboTarget(this.gl, fp.fboBloomA);
        this.disposeFboTarget(this.gl, fp.fboBloomB);
        this.disposeFboTarget(this.gl, fp.fboSoftA);
        this.disposeFboTarget(this.gl, fp.fboSoftB);
        this.disposeFboTarget(this.gl, fp.fboStreakA);
        this.disposeFboTarget(this.gl, fp.fboStreakB);
        this.disposeFboTarget(this.gl, fp.fboWingR);
        this.disposeFboTarget(this.gl, fp.fboWingL);
        this.disposeFboTarget(this.gl, fp.fboAssemble);
        this.glFlarePipeline = null;
      }
      if (this.glProgram) {
        this.gl.deleteProgram(this.glProgram);
      }
    }
  }
}
