import { PRISMATONE_WGSL_SHADER } from '../shaders/optical-pipeline.wgsl';
import {
  PRISMATONE_WEBGL2_VERTEX_SHADER,
  PRISMATONE_WEBGL2_FRAGMENT_SHADER,
} from '../shaders/optical-pipeline.glsl';

export type ActiveRenderBackend = 'webgpu' | 'webgl2' | 'canvas2d-fallback';

export interface EngineTelemetry {
  activeBackend: ActiveRenderBackend;
  lastFrameTimeMs: number;
  fpsEstimate: number;
  deviceLostCount: number;
  lastRecoveryStatus: string;
  shaderCompiled: boolean;
}

/**
 * Modular GPU Simulation Engine supporting WebGPU (WGSL) as primary path
 * with automatic or user-selectable WebGL2 (GLSL 300 es) fallback and device loss recovery.
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
  private glVao: WebGLVertexArrayObject | null = null;

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

    if (preferred === 'auto' || preferred === 'webgpu') {
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

      const vs = this.compileGlShader(gl, gl.VERTEX_SHADER, PRISMATONE_WEBGL2_VERTEX_SHADER);
      const fs = this.compileGlShader(gl, gl.FRAGMENT_SHADER, PRISMATONE_WEBGL2_FRAGMENT_SHADER);
      if (!vs || !fs) return false;

      const program = gl.createProgram();
      if (!program) return false;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('WebGL2 program link error:', gl.getProgramInfoLog(program));
        return false;
      }

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

      return true;
    } catch (err) {
      console.error('WebGL2 fallback init error:', err);
      return false;
    }
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
      gl.bindTexture(gl.TEXTURE_2D, this.glTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
  }

  /**
   * Renders a single frame through the active GPU optical pipeline using the 64-float uniform array.
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
    if (this.gl && this.glProgram) {
      this.gl.deleteProgram(this.glProgram);
    }
  }
}
