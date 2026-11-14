'use client';

import React, { useState } from 'react';
import { CameraProfile } from '../profiles/camera-profiles';
import { LensProfile } from '../profiles/lens-profiles';
import { OpticalSimulationParameters } from '../profiles/optical-math';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { RotateCcw, BookmarkPlus, Trash2, Check } from 'lucide-react';

export interface SavedOpticalPresetRecord {
  id: number;
  name: string;
  description: string;
  cameraId: string;
  lensId: string;
  parametersJson: string;
  isSystem: boolean;
}

interface OpticalParameterPanelProps {
  camera: CameraProfile;
  lens: LensProfile;
  params: OpticalSimulationParameters;
  onUpdateParam: <K extends keyof OpticalSimulationParameters>(
    key: K,
    value: OpticalSimulationParameters[K]
  ) => void;
  onResetToRigDefaults: () => void;
  presets: SavedOpticalPresetRecord[];
  activePresetId: number | null;
  onApplyPreset: (preset: SavedOpticalPresetRecord) => void;
  onSavePreset: (name: string, description: string) => Promise<boolean>;
  onDeletePreset: (id: number) => Promise<void>;
  isSavingPreset: boolean;
}

interface SliderRowProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  formatValue?: (v: number) => string;
  onChange: (val: number) => void;
}

function SliderRow({
  id,
  label,
  value,
  min,
  max,
  step,
  unit = '',
  formatValue,
  onChange,
}: SliderRowProps) {
  const display = formatValue ? formatValue(value) : `${value.toFixed(2)}${unit}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="text-slate-300 font-medium">
          {label}
        </label>
        <span className="font-mono tabular-nums text-amber-300/95 text-[11px]">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="studio-slider w-full"
      />
    </div>
  );
}

const FLARE_TINT_SWATCHES: { label: string; rgb: [number, number, number]; hex: string }[] = [
  { label: 'Cobalt Blue (Anamorphic)', rgb: [0.18, 0.54, 1.0], hex: '#2e8aff' },
  { label: 'Amber Gold (Vintage K35)', rgb: [1.0, 0.64, 0.28], hex: '#ffa347' },
  { label: 'T* Cyan-White (Modern)', rgb: [0.85, 0.94, 1.0], hex: '#d9f0ff' },
  { label: 'Ruby Magenta (Uncoated)', rgb: [1.0, 0.36, 0.52], hex: '#ff5c85' },
];

export function OpticalParameterPanel({
  camera,
  lens,
  params,
  onUpdateParam,
  onResetToRigDefaults,
  presets,
  activePresetId,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  isSavingPreset,
}: OpticalParameterPanelProps) {
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetName.trim();
    if (!trimmed) {
      setValidationError('Please enter a preset name before saving.');
      return;
    }
    setValidationError(null);
    const ok = await onSavePreset(
      trimmed,
      presetDesc.trim() || `${camera.model} + ${lens.model} custom optical profile`
    );
    if (ok) {
      setPresetName('');
      setPresetDesc('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  return (
    <aside className="w-full lg:w-[340px] xl:w-[360px] shrink-0 bg-[#11131a] border-l border-slate-800/90 flex flex-col">
      {/* Inspector Header */}
      <div className="px-4 py-3 border-b border-slate-800/90 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold text-slate-100">Optical & Sensor Inspector</h2>
          <p className="text-[11px] text-slate-400 truncate max-w-[210px]">
            {camera.manufacturer} · {lens.model}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onResetToRigDefaults}
          aria-label="Reset Optical Parameters"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Rig</span>
        </Button>
      </div>

      {/* Categorized Parameter Tabs */}
      <div className="p-3 flex-1 overflow-y-auto">
        <Tabs defaultValue="optics" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="optics">Optics</TabsTrigger>
            <TabsTrigger value="bokeh">Bokeh/Flare</TabsTrigger>
            <TabsTrigger value="sensor">Sensor</TabsTrigger>
            <TabsTrigger value="presets">Presets</TabsTrigger>
          </TabsList>

          {/* TAB 1: OPTICS, DISTORTION, CA, VIGNETTING & SHARPNESS */}
          <TabsContent value="optics" className="space-y-4 pt-3">
            <div className="space-y-3 pb-3 border-b border-slate-800/80">
              <div className="text-[11px] font-medium text-slate-400">
                Aperture, Focus & Breathing
              </div>
              <SliderRow
                id="param-aperture"
                label="Aperture T-Stop"
                value={params.apertureFStop}
                min={lens.maxApertureTStop}
                max={22}
                step={0.1}
                formatValue={(v) => `T${v.toFixed(1)}`}
                onChange={(v) => onUpdateParam('apertureFStop', v)}
              />
              <SliderRow
                id="param-focus-dist"
                label="Focus Distance"
                value={params.focusDistanceM}
                min={lens.closeFocusM}
                max={15.0}
                step={0.05}
                formatValue={(v) => `${v.toFixed(2)} m`}
                onChange={(v) => onUpdateParam('focusDistanceM', v)}
              />
              <SliderRow
                id="param-breathing"
                label="Focus Breathing"
                value={params.focusBreathing}
                min={0}
                max={0.5}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('focusBreathing', v)}
              />
            </div>

            <div className="space-y-3 pb-3 border-b border-slate-800/80">
              <div className="text-[11px] font-medium text-slate-400">
                Lens Distortion & Chromatic Aberration
              </div>
              <SliderRow
                id="param-k1"
                label="Radial Distortion (k1)"
                value={params.distortionK1}
                min={-0.5}
                max={0.5}
                step={0.01}
                formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
                onChange={(v) => onUpdateParam('distortionK1', v)}
              />
              <SliderRow
                id="param-k2"
                label=" Quartic Distortion (k2)"
                value={params.distortionK2}
                min={-0.3}
                max={0.3}
                step={0.01}
                formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
                onChange={(v) => onUpdateParam('distortionK2', v)}
              />
              <SliderRow
                id="param-ca"
                label="Chromatic Aberration"
                value={params.chromaticAberration}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('chromaticAberration', v)}
              />
            </div>

            <div className="space-y-3">
              <div className="text-[11px] font-medium text-slate-400">
                Vignetting & Optical MTF Acutance
              </div>
              <SliderRow
                id="param-vignette"
                label="Optical Vignetting"
                value={params.vignettingAmount}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('vignettingAmount', v)}
              />
              <SliderRow
                id="param-vig-falloff"
                label="Illumination Falloff (cos⁴θ)"
                value={params.vignettingFalloff}
                min={0.8}
                max={3.0}
                step={0.05}
                formatValue={(v) => v.toFixed(2)}
                onChange={(v) => onUpdateParam('vignettingFalloff', v)}
              />
              <SliderRow
                id="param-sharpness"
                label="Center Optical Sharpness"
                value={params.sharpness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('sharpness', v)}
              />
              <SliderRow
                id="param-corner-softness"
                label="Edge Coma & Corner Softness"
                value={params.cornerSoftness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('cornerSoftness', v)}
              />
            </div>
          </TabsContent>

          {/* TAB 2: BOKEH, ANAMORPHIC, FLARES, BLOOM & HALATION */}
          <TabsContent value="bokeh" className="space-y-4 pt-3">
            <div className="space-y-3 pb-3 border-b border-slate-800/80">
              <div className="text-[11px] font-medium text-slate-400">
                Depth of Field & Anamorphic Geometry
              </div>
              <SliderRow
                id="param-bokeh-radius"
                label="Bokeh Disc Blur Radius"
                value={params.bokehRadius}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('bokehRadius', v)}
              />
              <SliderRow
                id="param-bokeh-swirl"
                label="Petzval / Cat-Eye Swirl"
                value={params.bokehSwirl}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('bokehSwirl', v)}
              />

              <div className="space-y-1.5 pt-1">
                <span className="text-xs text-slate-300 font-medium block">
                  Anamorphic Squeeze Factor
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1.0, 1.33, 1.5, 2.0].map((sq) => (
                    <button
                      key={sq}
                      type="button"
                      onClick={() => onUpdateParam('anamorphicSqueeze', sq)}
                      className={`py-1.5 px-2 text-xs font-mono tabular-nums rounded border transition-colors whitespace-nowrap shrink-0 ${
                        Math.abs(params.anamorphicSqueeze - sq) < 0.05
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-[#161923] text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {sq === 1.0 ? '1.0x Sph' : `${sq}x Ana`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-[11px] font-medium text-slate-400">
                Internal Reflections, Bloom & Halation
              </div>
              <SliderRow
                id="param-flare"
                label="Streak Flare & Ghosting"
                value={params.flareIntensity}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('flareIntensity', v)}
              />

              <div className="space-y-1.5">
                <span className="text-xs text-slate-300 font-medium block">
                  Anti-Reflective Coating Tint
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {FLARE_TINT_SWATCHES.map((sw) => {
                    const isSelected =
                      Math.abs(params.flareTint[0] - sw.rgb[0]) < 0.08 &&
                      Math.abs(params.flareTint[2] - sw.rgb[2]) < 0.08;
                    return (
                      <button
                        key={sw.label}
                        type="button"
                        onClick={() => onUpdateParam('flareTint', sw.rgb)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-left text-[11px] transition-colors truncate ${
                          isSelected
                            ? 'bg-slate-800 border-amber-500/80 text-white'
                            : 'bg-[#151822] border-slate-800/80 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: sw.hex }}
                        />
                        <span className="truncate">{sw.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <SliderRow
                id="param-bloom"
                label="Highlight Optical Bloom"
                value={params.bloomIntensity}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('bloomIntensity', v)}
              />
              <SliderRow
                id="param-halation"
                label="Emulsion Red Halation Scatter"
                value={params.halationIntensity}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('halationIntensity', v)}
              />
            </div>
          </TabsContent>

          {/* TAB 3: CAMERA COLOR SCIENCE, SENSOR NOISE & FOCUS PEAKING */}
          <TabsContent value="sensor" className="space-y-4 pt-3">
            <div className="space-y-3 pb-3 border-b border-slate-800/80">
              <div className="text-[11px] font-medium text-slate-400">
                Camera Color Science ({camera.colorSpace})
              </div>
              <SliderRow
                id="param-temp"
                label="Color Temperature Shift"
                value={params.colorTemperatureShift}
                min={-0.4}
                max={0.4}
                step={0.01}
                formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} Warm`}
                onChange={(v) => onUpdateParam('colorTemperatureShift', v)}
              />
              <SliderRow
                id="param-tint"
                label="Green / Magenta Tint"
                value={params.tintShift}
                min={-0.4}
                max={0.4}
                step={0.01}
                formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`}
                onChange={(v) => onUpdateParam('tintShift', v)}
              />
              <SliderRow
                id="param-contrast"
                label="Contrast (18% Gray Pivot)"
                value={params.contrast}
                min={0.7}
                max={1.5}
                step={0.01}
                formatValue={(v) => `${v.toFixed(2)}×`}
                onChange={(v) => onUpdateParam('contrast', v)}
              />
              <SliderRow
                id="param-saturation"
                label="Chroma Saturation"
                value={params.saturation}
                min={0.0}
                max={1.6}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('saturation', v)}
              />
              <SliderRow
                id="param-rolloff"
                label="Highlight Rolloff Shoulder"
                value={params.highlightRolloff}
                min={0.2}
                max={1.0}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('highlightRolloff', v)}
              />
            </div>

            <div className="space-y-3">
              <div className="text-[11px] font-medium text-slate-400">
                Sensor ISO Gain, Grain Texture & Focus Assist
              </div>
              <SliderRow
                id="param-iso"
                label="Sensor Sensitivity (ISO / ASA)"
                value={params.sensorGainIso}
                min={100}
                max={12800}
                step={100}
                formatValue={(v) => `ISO ${Math.round(v)}`}
                onChange={(v) => onUpdateParam('sensorGainIso', v)}
              />
              <SliderRow
                id="param-grain"
                label="Sensor Noise / Silver Grain"
                value={params.sensorGrainAmount}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onUpdateParam('sensorGrainAmount', v)}
              />

              <div className="flex items-center justify-between pt-2 bg-[#161923] border border-slate-800 rounded-md px-3 py-2">
                <div>
                  <label htmlFor="focus-peaking-switch" className="text-xs font-medium text-slate-200 block">
                    Focus Peaking Assist
                  </label>
                  <span className="text-[11px] text-slate-400">
                    High-pass Sobel edge overlay in viewport
                  </span>
                </div>
                <Switch
                  id="focus-peaking-switch"
                  checked={params.focusPeaking}
                  onCheckedChange={(checked) => onUpdateParam('focusPeaking', checked)}
                />
              </div>
            </div>
          </TabsContent>

          {/* TAB 4: POSTGRESQL OPTICAL PRESET LIBRARY */}
          <TabsContent value="presets" className="space-y-4 pt-3">
            <form onSubmit={handleSaveSubmit} className="space-y-2.5 bg-[#151822] border border-slate-800 rounded-md p-3">
              <div className="text-xs font-semibold text-slate-200">
                Save Current Rig to PostgreSQL
              </div>
              <div>
                <label htmlFor="preset-name-input" className="sr-only">
                  Preset Name
                </label>
                <input
                  id="preset-name-input"
                  type="text"
                  placeholder="Preset name (e.g. Blade Runner Neon 50mm)"
                  value={presetName}
                  onChange={(e) => {
                    setPresetName(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-[#0b0d13] border border-slate-700 rounded text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label htmlFor="preset-desc-input" className="sr-only">
                  Preset Description
                </label>
                <input
                  id="preset-desc-input"
                  type="text"
                  placeholder="Notes on lighting, squeeze, or LUT response..."
                  value={presetDesc}
                  onChange={(e) => setPresetDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-[#0b0d13] border border-slate-700 rounded text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              {validationError && (
                <p role="alert" className="text-[11px] text-rose-400 font-medium">
                  {validationError}
                </p>
              )}
              {saveSuccess && (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                  <Check className="w-3.5 h-3.5" />
                  <span>Preset saved to PostgreSQL library.</span>
                </p>
              )}
              <Button type="submit" size="sm" className="w-full" disabled={isSavingPreset}>
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>{isSavingPreset ? 'Saving...' : 'Save Optical Preset'}</span>
              </Button>
            </form>

            <div className="space-y-2">
              <div className="text-[11px] font-medium text-slate-400">
                Saved Optical Presets ({presets.length})
              </div>
              {presets.length === 0 ? (
                <div className="text-xs text-slate-400 bg-[#151822] border border-slate-800/80 rounded p-3">
                  No optical presets found. Save your first custom camera & lens configuration above.
                </div>
              ) : (
                <div className="space-y-2">
                  {presets.map((preset) => {
                    const isActive = activePresetId === preset.id;
                    return (
                      <div
                        key={preset.id}
                        className={`p-2.5 rounded-md border transition-colors ${
                          isActive
                            ? 'bg-amber-950/30 border-amber-500/70'
                            : 'bg-[#151822] border-slate-800/90 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onApplyPreset(preset)}
                            className="text-left flex-1 group"
                          >
                            <div className="text-xs font-semibold text-slate-100 group-hover:text-amber-300 transition-colors">
                              {preset.name}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                              {preset.description}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 mt-1.5">
                              {preset.cameraId} · {preset.lensId}
                            </div>
                          </button>
                          {!preset.isSystem && (
                            <button
                              type="button"
                              onClick={() => onDeletePreset(preset.id)}
                              aria-label={`Delete preset '${preset.name}'`}
                              className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </aside>
  );
}
