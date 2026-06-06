import type { FrameworkPack } from './types.js';
import { PythonPack } from './packs/python.js';
import { JavaScriptPack } from './packs/javascript.js';

export function loadFreePacks(): FrameworkPack[] {
  return [PythonPack, JavaScriptPack];
}
