import { decodeBlockTree } from '../../block-tree/codecs';
import { captureNative, nativeBytes } from '../../persistence/native-resource';
import { convertTei } from './convert';
import { teiLimits, type TeiLimits } from './model';
import type { SuppliedFile } from '../file-input';

/** Internally generated native data, never the external clipboard allowlist. */
export async function prepareTeiDocument(file: SuppliedFile, options: Partial<TeiLimits> = {}) {
  const limits = teiLimits(options);
  if (file.blob.size > limits.bytes) throw Error(`TEI input exceeds the configured ${limits.bytes}-byte limit. Nothing was imported.`);
  const result = convertTei(new Uint8Array(await file.blob.arrayBuffer()), limits, file.name);
  const state = decodeBlockTree(result.document).state;
  const resource = captureNative(state, result.document.id);
  return { bytes: nativeBytes(resource), id: result.document.id, diagnostics: result.diagnostics, truncated: result.truncated, stats: result.stats };
}
