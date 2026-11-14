'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CameraProfile } from '../profiles/camera-profiles';
import { LensProfile } from '../profiles/lens-profiles';
import { OpticalSimulationParameters } from '../profiles/optical-math';
import { ChevronDown, ChevronUp, Eye, Layers, RotateCcw } from 'lucide-react';

interface OpticalBench3DProps {
  camera: CameraProfile;
  lens: LensProfile;
  params: OpticalSimulationParameters;
}

export function OpticalBench3D({ camera, lens, params }: OpticalBench3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [explodedAmount, setExplodedAmount] = useState<number>(0.38);
  const [showLightRays, setShowLightRays] = useState<boolean>(true);
  const [cutawayHousing, setCutawayHousing] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [activeCamPreset, setActiveCamPreset] = useState<'isometric' | 'side' | 'front' | 'sensor'>('isometric');

  // Store mutable props in ref so Three.js scene updates smoothly without re-mounting WebGLRenderer
  const stateRef = useRef({
    camera,
    lens,
    params,
    explodedAmount,
    showLightRays,
    cutawayHousing,
    activeCamPreset,
  });

  const triggerRenderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stateRef.current = {
      camera,
      lens,
      params,
      explodedAmount,
      showLightRays,
      cutawayHousing,
      activeCamPreset,
    };
    if (triggerRenderRef.current) {
      triggerRenderRef.current();
    }
  }, [camera, lens, params, explodedAmount, showLightRays, cutawayHousing, activeCamPreset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(320, container.clientWidth || 800);
    const height = Math.max(240, container.clientHeight || 480);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x090b10);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0x090b10, 0.045);

    // 2. Mandatory Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const perspCam = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    perspCam.position.set(4.6, 2.2, 4.8);

    const controls = new OrbitControls(perspCam, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.1, 0);
    controls.minDistance = 2.2;
    controls.maxDistance = 14.0;

    // 3. Balanced 3-Point Studio Lighting Rig (warm key + cool hemisphere fill + rim)
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    keyLight.position.set(5, 7, 4);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.3);
    rimLight.position.set(-5, 3, -5);
    scene.add(rimLight);

    // 4. Grounding Optical Bench Base, Support Rods & Contact Shadow
    const benchGroup = new THREE.Group();
    scene.add(benchGroup);

    const contactGeo = new THREE.PlaneGeometry(10, 5);
    const contactCanvas = document.createElement('canvas');
    contactCanvas.width = 128;
    contactCanvas.height = 128;
    const cctx = contactCanvas.getContext('2d');
    if (cctx) {
      const g = cctx.createRadialGradient(64, 64, 6, 64, 64, 60);
      g.addColorStop(0, 'rgba(0,0,0,0.75)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      cctx.fillStyle = g;
      cctx.fillRect(0, 0, 128, 128);
    }
    const contactTex = new THREE.CanvasTexture(contactCanvas);
    const contactMat = new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const contactShadow = new THREE.Mesh(contactGeo, contactMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -1.18;
    benchGroup.add(contactShadow);

    // Twin 15mm LWS Carbon/Steel Support Rods
    const rodGeo = new THREE.CylinderGeometry(0.06, 0.06, 6.2, 20);
    rodGeo.rotateZ(Math.PI / 2);
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.88,
      roughness: 0.22,
    });
    const rodLeft = new THREE.Mesh(rodGeo, rodMat);
    rodLeft.position.set(0, -0.95, 0.65);
    const rodRight = new THREE.Mesh(rodGeo, rodMat);
    rodRight.position.set(0, -0.95, -0.65);
    benchGroup.add(rodLeft, rodRight);

    // Baseplate Pedestal
    const baseplateGeo = new THREE.BoxGeometry(5.6, 0.14, 1.8);
    const baseplateMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.65,
      roughness: 0.52,
    });
    const baseplate = new THREE.Mesh(baseplateGeo, baseplateMat);
    baseplate.position.set(0, -1.1, 0);
    benchGroup.add(baseplate);

    // 5. Camera Body & Sensor Plane Assembly (Left/Rear of optical axis X = -2.2)
    const cameraRigGroup = new THREE.Group();
    cameraRigGroup.position.set(-2.1, 0, 0);
    benchGroup.add(cameraRigGroup);

    const camBodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      metalness: 0.45,
      roughness: 0.68,
    });
    const camBodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.55, 1.65), camBodyMat);
    camBodyMesh.position.set(-0.75, 0.05, 0);
    cameraRigGroup.add(camBodyMesh);

    // PL Mount Stainless Flange
    const plMountMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.92,
      roughness: 0.18,
    });
    const plMountGeo = new THREE.CylinderGeometry(0.68, 0.72, 0.22, 32);
    plMountGeo.rotateZ(Math.PI / 2);
    const plMountMesh = new THREE.Mesh(plMountGeo, plMountMat);
    plMountMesh.position.set(-0.02, 0.05, 0);
    cameraRigGroup.add(plMountMesh);

    // Illuminated CMOS / Film Sensor Plane
    const sensorMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      metalness: 0.9,
      roughness: 0.12,
    });
    const sensorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.76, 1.12), sensorMat);
    sensorMesh.position.set(0.12, 0.05, 0);
    cameraRigGroup.add(sensorMesh);

    // 6. Multi-Element Optical Glass Lens Group & Cutaway Barrel
    const lensGroup = new THREE.Group();
    lensGroup.position.set(0, 0.05, 0);
    benchGroup.add(lensGroup);

    // Cutaway anodized barrel rings
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x171b24,
      metalness: 0.75,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });
    const barrelOuterGeo = new THREE.CylinderGeometry(0.86, 0.82, 3.2, 32, 1, true, 0, Math.PI * 1.3);
    barrelOuterGeo.rotateZ(Math.PI / 2);
    const barrelHousing = new THREE.Mesh(barrelOuterGeo, barrelMat);
    barrelHousing.rotation.x = Math.PI * 0.25;
    lensGroup.add(barrelHousing);

    // Brass geared focus & iris rings
    const gearRingMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.88,
      roughness: 0.26,
    });
    const focusGearGeo = new THREE.CylinderGeometry(0.91, 0.91, 0.22, 48, 1, true);
    focusGearGeo.rotateZ(Math.PI / 2);
    const focusGearMesh = new THREE.Mesh(focusGearGeo, gearRingMat);
    focusGearMesh.position.set(0.45, 0, 0);
    lensGroup.add(focusGearMesh);

    // 5 Optical Glass Elements with Multi-Layer Anti-Reflective Coating Material
    const elementSpecs = [
      { baseX: -1.1, radius: 0.56, thick: 0.14, curve: 1.1 },
      { baseX: -0.55, radius: 0.62, thick: 0.18, curve: 0.9 },
      { baseX: 0.20, radius: 0.68, thick: 0.22, curve: 1.2 },
      { baseX: 0.85, radius: 0.76, thick: 0.20, curve: 1.0 },
      { baseX: 1.45, radius: 0.82, thick: 0.24, curve: 1.3 },
    ];

    const glassMaterials: THREE.MeshPhysicalMaterial[] = [];
    const glassMeshes: THREE.Mesh[] = [];

    elementSpecs.forEach((spec, idx) => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x93c5fd),
        metalness: 0.05,
        roughness: 0.08,
        transmission: isSoftwareGl ? 0 : 0.92,
        transparent: true,
        opacity: isSoftwareGl ? 0.42 : 1.0,
        ior: 1.62 + idx * 0.04,
        thickness: 0.8,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        depthWrite: false,
      });
      glassMaterials.push(mat);

      const geo = new THREE.CylinderGeometry(spec.radius, spec.radius * 0.96, spec.thick, 36);
      geo.rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 2 + idx;
      mesh.position.set(spec.baseX, 0, 0);
      lensGroup.add(mesh);
      glassMeshes.push(mesh);
    });

    // Front Anamorphic Cylindrical Element (visible when anamorphicSqueeze > 1.05)
    const anamorphicMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x38bdf8),
      metalness: 0.1,
      roughness: 0.06,
      transmission: isSoftwareGl ? 0 : 0.94,
      transparent: true,
      opacity: isSoftwareGl ? 0.48 : 1.0,
      ior: 1.75,
      clearcoat: 1.0,
      depthWrite: false,
    });
    const anamorphicGeo = new THREE.BoxGeometry(0.26, 1.42, 1.15);
    const anamorphicElement = new THREE.Mesh(anamorphicGeo, anamorphicMat);
    anamorphicElement.position.set(2.05, 0, 0);
    anamorphicElement.renderOrder = 10;
    lensGroup.add(anamorphicElement);

    // 7. Adjustable Multi-Blade Mechanical Aperture Iris (at X = -0.18)
    const irisGroup = new THREE.Group();
    irisGroup.position.set(-0.18, 0, 0);
    lensGroup.add(irisGroup);

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.82,
      roughness: 0.32,
    });
    const bladeCount = 12;
    const irisBlades: THREE.Mesh[] = [];
    const bladeGeo = new THREE.BoxGeometry(0.025, 0.38, 0.18);
    for (let b = 0; b < bladeCount; b++) {
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      irisGroup.add(blade);
      irisBlades.push(blade);
    }

    // 8. Optical Ray-Tracing Bundle (from Object Field X = +3.2 through Iris to Sensor X = -1.95)
    const rayGroup = new THREE.Group();
    benchGroup.add(rayGroup);
    const rayMaterial = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
    });
    const caRedRayMat = new THREE.LineBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.55,
    });
    const rayPoints = new Float32Array(8 * 6 * 3);
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPoints, 3));
    const rayLines = new THREE.LineSegments(rayGeo, rayMaterial);
    rayGroup.add(rayLines);

    const caPoints = new Float32Array(4 * 2 * 3);
    const caGeo = new THREE.BufferGeometry();
    caGeo.setAttribute('position', new THREE.BufferAttribute(caPoints, 3));
    const caLines = new THREE.LineSegments(caGeo, caRedRayMat);
    rayGroup.add(caLines);

    // Pre-allocated target vectors for smooth camera preset transitions
    const desiredCamPos = new THREE.Vector3(4.6, 2.2, 4.8);
    const desiredTarget = new THREE.Vector3(0, 0.1, 0);
    let camTransitionActive = false;

    const applySceneState = () => {
      const st = stateRef.current;
      const exp = st.explodedAmount;

      // Scale sensor plane to match selected camera sensor aspect ratio
      const sensorScaleZ = st.camera.sensorWidthMm / 28.0;
      const sensorScaleY = st.camera.sensorHeightMm / 28.0;
      sensorMesh.scale.set(1, sensorScaleY, sensorScaleZ);

      // Tint glass coatings to match active lens flareTint
      const [fr, fg, fb] = st.params.flareTint;
      const tintColor = new THREE.Color(
        0.55 + fr * 0.45,
        0.65 + fg * 0.35,
        0.75 + fb * 0.25
      );
      glassMaterials.forEach((m) => {
        m.color.copy(tintColor);
      });

      // Focus group travel & Exploded View spacing
      const focusTravel = (1.0 / Math.max(0.4, st.params.focusDistanceM) - 0.3) * 0.28;
      glassMeshes.forEach((mesh, idx) => {
        const base = elementSpecs[idx].baseX;
        const explodeOffset = (idx - 1.5) * exp * 0.65;
        const focusShift = idx >= 2 ? focusTravel : 0;
        mesh.position.x = base + explodeOffset + focusShift;
      });

      // Anamorphic front element visibility & squeeze scale
      const isAnamorphic = st.params.anamorphicSqueeze > 1.08;
      anamorphicElement.visible = isAnamorphic;
      if (isAnamorphic) {
        anamorphicElement.position.x = 2.05 + exp * 1.1 + focusTravel;
        anamorphicElement.scale.set(1, 1, Math.min(1.5, st.params.anamorphicSqueeze * 0.65));
      }

      // Aperture Iris opening radius based on apertureFStop (T1.4 wide open -> T22 closed down)
      const fStop = Math.max(1.2, st.params.apertureFStop);
      const openRadius = THREE.MathUtils.clamp(0.54 / Math.sqrt(fStop * 0.7), 0.11, 0.52);
      irisBlades.forEach((blade, idx) => {
        const angle = (idx / bladeCount) * Math.PI * 2;
        blade.position.set(0, Math.cos(angle) * openRadius, Math.sin(angle) * openRadius);
        blade.rotation.x = angle + 0.35;
      });

      barrelHousing.visible = st.cutawayHousing;
      rayGroup.visible = st.showLightRays;

      // Update optical ray-bundle geometry dynamically based on iris opening & CA
      const posAttr = rayGeo.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const frontX = isAnamorphic ? anamorphicElement.position.x : glassMeshes[4].position.x;
      const irisX = irisGroup.position.x;
      const sensorX = -1.95;

      for (let r = 0; r < 8; r++) {
        const ang = (r / 8) * Math.PI * 2;
        const sy = Math.cos(ang);
        const sz = Math.sin(ang) * (isAnamorphic ? 1.35 : 1.0);

        const objX = 3.4;
        const objY = sy * 0.78;
        const objZ = sz * 0.78;

        const fY = sy * 0.62;
        const fZ = sz * 0.62;

        const iY = sy * openRadius * 0.85;
        const iZ = sz * openRadius * 0.85;

        const senY = -sy * 0.28 * sensorScaleY;
        const senZ = -sz * 0.28 * sensorScaleZ;

        const baseIdx = r * 18;
        // Segment 1: Object -> Front Element
        arr[baseIdx + 0] = objX;
        arr[baseIdx + 1] = objY;
        arr[baseIdx + 2] = objZ;
        arr[baseIdx + 3] = frontX;
        arr[baseIdx + 4] = fY;
        arr[baseIdx + 5] = fZ;

        // Segment 2: Front Element -> Aperture Iris Stop
        arr[baseIdx + 6] = frontX;
        arr[baseIdx + 7] = fY;
        arr[baseIdx + 8] = fZ;
        arr[baseIdx + 9] = irisX;
        arr[baseIdx + 10] = iY;
        arr[baseIdx + 11] = iZ;

        // Segment 3: Aperture Iris Stop -> CMOS Sensor Plane
        arr[baseIdx + 12] = irisX;
        arr[baseIdx + 13] = iY;
        arr[baseIdx + 14] = iZ;
        arr[baseIdx + 15] = sensorX;
        arr[baseIdx + 16] = senY;
        arr[baseIdx + 17] = senZ;
      }
      posAttr.needsUpdate = true;

      // Chromatic dispersion rays from iris to sensor
      const caAttr = caGeo.getAttribute('position') as THREE.BufferAttribute;
      const caArr = caAttr.array as Float32Array;
      const caSpread = st.params.chromaticAberration * 0.22;
      for (let c = 0; c < 4; c++) {
        const ang = (c / 4) * Math.PI * 2 + 0.4;
        const sy = Math.cos(ang);
        const sz = Math.sin(ang);
        const idx = c * 6;
        caArr[idx + 0] = irisX;
        caArr[idx + 1] = sy * openRadius * 0.8;
        caArr[idx + 2] = sz * openRadius * 0.8;
        caArr[idx + 3] = sensorX;
        caArr[idx + 4] = -sy * (0.28 + caSpread);
        caArr[idx + 5] = -sz * (0.28 + caSpread);
      }
      caAttr.needsUpdate = true;
    };

    // On-demand rendering with software-WebGL pacing (afterDraw)
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (gl.flush) gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        applySceneState();

        if (camTransitionActive) {
          perspCam.position.lerp(desiredCamPos, 0.18);
          controls.target.lerp(desiredTarget, 0.18);
          if (perspCam.position.distanceTo(desiredCamPos) < 0.04) {
            camTransitionActive = false;
          } else {
            renderDirty = true;
          }
        }

        controls.update();
        renderer.render(scene, perspCam);

        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    triggerRenderRef.current = () => {
      const preset = stateRef.current.activeCamPreset;
      if (preset === 'isometric') {
        desiredCamPos.set(4.5, 2.1, 4.6);
        desiredTarget.set(0, 0.05, 0);
      } else if (preset === 'side') {
        desiredCamPos.set(0.1, 0.4, 5.8);
        desiredTarget.set(0, 0.05, 0);
      } else if (preset === 'front') {
        desiredCamPos.set(5.4, 0.3, 0.8);
        desiredTarget.set(0, 0.05, 0);
      } else if (preset === 'sensor') {
        desiredCamPos.set(-4.6, 1.4, 2.8);
        desiredTarget.set(-1.5, 0.05, 0);
      }
      camTransitionActive = true;
      requestRender();
    };

    controls.addEventListener('start', () => {
      camTransitionActive = false;
    });
    controls.addEventListener('change', requestRender);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      perspCam.aspect = w / h;
      perspCam.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };

    window.addEventListener('resize', handleResize);
    if (!isSoftwareGl) {
      renderer.compile(scene, perspCam);
    }
    requestRender();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[380px] bg-[#090b10] overflow-hidden select-none">
      {/* Dedicated WebGL Mount Container */}
      <div
        ref={mountRef}
        data-testid="optical-bench-3d-canvas"
        className="w-full h-full"
      />

      {/* Minimal Top-Left Optical Spec Overlay */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none bg-[#11131a]/90 border border-slate-800 rounded-md px-3 py-2">
        <div className="text-xs font-medium text-slate-200">
          3D Optical Bench · {lens.manufacturer} {lens.model}
        </div>
        <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
          {lens.elementCount} Elements / {lens.groupCount} Groups · {lens.irisBlades}-Blade Iris @ T
          {params.apertureFStop.toFixed(1)} · Sensor {camera.sensorWidthMm}×{camera.sensorHeightMm}mm
        </div>
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Center Occlusion) */}
      <div
        style={{
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 'min(880px, 94vw)',
        }}
        className="absolute z-10 flex flex-col items-center w-full"
      >
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          aria-label={dockCollapsed ? 'Show 3D Optical Controls' : 'Hide 3D Optical Controls'}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-300 bg-[#141822] border border-slate-800 rounded-t-md hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? 'Show Bench Controls' : 'Hide Bench Controls'}</span>
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-[#11131a] border border-slate-800 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            {/* Exploded View Separation Slider */}
            <div className="flex items-center gap-2.5 min-w-[200px]">
              <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <label htmlFor="exploded-slider" className="text-xs text-slate-300 whitespace-nowrap shrink-0">
                Exploded Elements
              </label>
              <input
                id="exploded-slider"
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={explodedAmount}
                onChange={(e) => setExplodedAmount(parseFloat(e.target.value))}
                className="studio-slider w-24"
              />
              <span className="text-xs font-mono tabular-nums text-slate-400 w-9 text-right">
                {Math.round(explodedAmount * 100)}%
              </span>
            </div>

            {/* Camera View Angle Buttons */}
            <div className="flex items-center gap-1 bg-[#0b0d13] p-1 rounded-md border border-slate-800/80">
              {(['isometric', 'side', 'front', 'sensor'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setActiveCamPreset(preset)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize whitespace-nowrap shrink-0 ${
                    activeCamPreset === preset
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Ray Bundle & Cutaway Toggles */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLightRays((prev) => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  showLightRays
                    ? 'bg-sky-950/60 border-sky-700/70 text-sky-200'
                    : 'bg-[#161923] border-slate-800 text-slate-400'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Ray Bundle</span>
              </button>

              <button
                type="button"
                onClick={() => setCutawayHousing((prev) => !prev)}
                className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  cutawayHousing
                    ? 'bg-amber-950/50 border-amber-700/60 text-amber-200'
                    : 'bg-[#161923] border-slate-800 text-slate-400'
                }`}
              >
                Cutaway Barrel
              </button>

              <button
                type="button"
                onClick={() => {
                  setExplodedAmount(0.38);
                  setActiveCamPreset('isometric');
                }}
                aria-label="Reset 3D View"
                className="p-1.5 text-slate-400 hover:text-slate-200 bg-[#161923] border border-slate-800 rounded"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
