import * as THREE from 'three';

type Mode = 'fast' | 'accurate';

export interface CrosshairManagerOptions {
  mode?: Mode;
  sampleInterval?: number;     // frames between samples (>=1)
  sampleSize?: number;         // render target size (e.g. 8 = 8x8)
  smoothing?: number;          // 0..1 (0 no smoothing, 1 infinite smoothing), use 0.1..0.9
  threshold?: number;          // brightness threshold 0..1
  onColorChange?: (isLight: boolean, brightness: number) => void;
}

export class CrosshairManager {
  private renderer: THREE.WebGLRenderer;
  private scene?: THREE.Scene; // optional for fast mode
  private camera?: THREE.Camera;
  private pixelBuf: Uint8Array;
  private frame = 0;
  private currentBright = 0.5;
  private options: Required<CrosshairManagerOptions>;
  private readTarget?: THREE.WebGLRenderTarget;

  constructor(renderer: THREE.WebGLRenderer, scene?: THREE.Scene, camera?: THREE.Camera, opts?: CrosshairManagerOptions) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.options = {
      mode: opts?.mode ?? 'fast',
      sampleInterval: Math.max(1, opts?.sampleInterval ?? 15),
      sampleSize: Math.max(2, opts?.sampleSize ?? 8),
      smoothing: Math.min(0.95, Math.max(0, opts?.smoothing ?? 0.2)),
      threshold: Math.min(1, Math.max(0, opts?.threshold ?? 0.5)),
      onColorChange: opts?.onColorChange ?? ((isLight) => {
        const root = document.documentElement;
        if (isLight) {
          root.style.setProperty('--crosshair-color', 'rgba(0,0,0,0.8)');
          root.style.setProperty('--crosshair-border', 'rgba(255,255,255,0.5)');
        } else {
          root.style.setProperty('--crosshair-color', 'rgba(255,255,255,0.8)');
          root.style.setProperty('--crosshair-border', 'rgba(0,0,0,0.5)');
        }
      })
    };

    this.pixelBuf = new Uint8Array(4);
    // create small render target for accurate sampling (if needed)
    this.readTarget = new THREE.WebGLRenderTarget(this.options.sampleSize, this.options.sampleSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  // call this every frame (or from your main loop)
  public update(): void {
    this.frame++;
    if (this.options.mode === 'fast') {
      this.fastUpdate();
      return;
    }

    // accurate mode: sample every sampleInterval frames
    if (this.frame % this.options.sampleInterval !== 0) return;
    this.accurateSample();
  }

  private fastUpdate(): void {
    // Try to use scene background color or ambient light as heuristic
    if (this.scene && (this.scene.background instanceof THREE.Color)) {
      const c = this.scene.background as THREE.Color;
      const r = c.r, g = c.g, b = c.b;
      const brightness = 0.2126*r + 0.7152*g + 0.0722*b; // already linear in three.js Color
      this.applyBrightness(brightness);
      return;
    }

    // fallback: maybe use renderer clear color
    const clearColor = new THREE.Color();
    this.renderer.getClearColor(clearColor);
    const brightness = 0.2126*clearColor.r + 0.7152*clearColor.g + 0.0722*clearColor.b;
    this.applyBrightness(brightness);
  }

  private accurateSample(): void {
    if (!this.scene || !this.camera || !this.readTarget) {
      // fallback to fast heuristic if we don't have scene/camera or render target
      this.fastUpdate();
      return;
    }

    const prevTarget = this.renderer.getRenderTarget();
    // render scene into small offscreen target (low cost)
    this.renderer.setRenderTarget(this.readTarget);
    this.renderer.render(this.scene, this.camera);

    // read center pixel (or average multiple) from readTarget
    try {
      // read center pixel in RT coordinate system: y origin bottom-left for readRenderTargetPixels
      const size = this.readTarget.width;
      const cx = Math.floor(size / 2);
      const cy = Math.floor(size / 2);
      // read pixels into buffer [r,g,b,a] 0..255
      this.renderer.readRenderTargetPixels(this.readTarget, cx, cy, 1, 1, this.pixelBuf);

      // convert sRGB->linear if your texture is sRGB; three.js Color uses linear usually when reading
      // but readRenderTargetPixels returns bytes; assume sRGB encoded => convert
      const srgbToLinear = (v: number) => Math.pow(v / 255, 2.2);
      const lr = srgbToLinear(this.pixelBuf[0]);
      const lg = srgbToLinear(this.pixelBuf[1]);
      const lb = srgbToLinear(this.pixelBuf[2]);
      const brightness = 0.2126*lr + 0.7152*lg + 0.0722*lb;

      this.applyBrightness(brightness);
    } catch (err) {
      // readRenderTargetPixels can throw on some contexts — fallback
      console.debug('Crosshair sampling failed, fallback to fast heuristic:', err);
      this.fastUpdate();
    } finally {
      // restore previous render target
      this.renderer.setRenderTarget(prevTarget);
    }
  }

  private applyBrightness(brightness: number): void {
    // smoothing (exponential moving average)
    const s = this.options.smoothing;
    this.currentBright = s * this.currentBright + (1 - s) * brightness;

    const isLight = this.currentBright > this.options.threshold;
    // notify via callback (user updates UI CSS etc)
    this.options.onColorChange(isLight, this.currentBright);
  }

  public dispose(): void {
    if (this.readTarget) {
      this.readTarget.dispose();
      this.readTarget = undefined;
    }
  }
}
