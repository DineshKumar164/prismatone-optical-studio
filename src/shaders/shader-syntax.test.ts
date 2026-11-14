import assert from 'node:assert/strict';
import test from 'node:test';
import { PRISMATONE_WGSL_SHADER } from './optical-pipeline.wgsl';
import {
  PRISMATONE_WEBGL2_FRAGMENT_SHADER,
  PRISMATONE_WEBGL2_VERTEX_SHADER,
} from './optical-pipeline.glsl';
import {
  LUT_CAMERA_FRAGMENT_SHADER,
  LUT_CAMERA_VERTEX_SHADER,
} from './lut-bokeh-camera.glsl';

function assertBalancedDelimiters(source: string, label: string) {
  let braces = 0;
  let parens = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') braces += 1;
    else if (ch === '}') braces -= 1;
    else if (ch === '(') parens += 1;
    else if (ch === ')') parens -= 1;
    assert.ok(braces >= 0, `${label}: unmatched closing brace at index ${i}`);
    assert.ok(parens >= 0, `${label}: unmatched closing paren at index ${i}`);
  }
  assert.equal(braces, 0, `${label}: unbalanced curly braces (delta=${braces})`);
  assert.equal(parens, 0, `${label}: unbalanced parentheses (delta=${parens})`);
}

test('WGSL shader has balanced delimiters and required vs_main/fs_main entrypoints', () => {
  assertBalancedDelimiters(PRISMATONE_WGSL_SHADER, 'PRISMATONE_WGSL_SHADER');
  assert.match(PRISMATONE_WGSL_SHADER, /@vertex[\s\S]*fn vs_main/);
  assert.match(PRISMATONE_WGSL_SHADER, /@fragment[\s\S]*fn fs_main/);
});

test('WebGL2 vertex and fragment shaders have balanced delimiters and main entrypoints', () => {
  assertBalancedDelimiters(PRISMATONE_WEBGL2_VERTEX_SHADER, 'PRISMATONE_WEBGL2_VERTEX_SHADER');
  assertBalancedDelimiters(PRISMATONE_WEBGL2_FRAGMENT_SHADER, 'PRISMATONE_WEBGL2_FRAGMENT_SHADER');
  assert.match(PRISMATONE_WEBGL2_FRAGMENT_SHADER, /void main\(\)/);

  assertBalancedDelimiters(LUT_CAMERA_VERTEX_SHADER, 'LUT_CAMERA_VERTEX_SHADER');
  assertBalancedDelimiters(LUT_CAMERA_FRAGMENT_SHADER, 'LUT_CAMERA_FRAGMENT_SHADER');
  assert.match(LUT_CAMERA_FRAGMENT_SHADER, /uniform float u_apertureFStop/);
  assert.match(LUT_CAMERA_FRAGMENT_SHADER, /computeCircleOfConfusion/);
  assert.match(LUT_CAMERA_FRAGMENT_SHADER, /void main\(\)/);
});
