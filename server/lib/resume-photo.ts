/* The photo in a resume PDF, offered as the user's avatar.
 *
 * Most resume photos are embedded as JPEG (a /DCTDecode image), and a JPEG
 * stream in a PDF is the JPEG file byte for byte, so it can be handed out as
 * it is: no PDF library, no rendering. The largest roughly-square image wins;
 * logos and icons are too small or too wide to be a face. Nothing leaves this
 * computer, and the user still frames it in the cropper and presses Save.
 */
import { readFile } from "node:fs/promises";

export type ResumePhoto = { jpeg: Buffer; width: number; height: number };

export async function resumePhoto(pdfPath: string): Promise<ResumePhoto | null> {
  let buf: Buffer;
  try { buf = await readFile(pdfPath); } catch { return null; }
  const text = buf.toString("latin1");
  let best: ResumePhoto | null = null;
  const re = /\/Subtype\s*\/Image/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const objStart = text.lastIndexOf(" obj", m.index);
    const streamAt = text.indexOf("stream", m.index);
    if (objStart < 0 || streamAt < 0) continue;
    const dict = text.slice(objStart, streamAt);
    /* only a plain JPEG: a Flate-wrapped or masked-only image is not a file */
    if (!/\/Filter\s*\/DCTDecode/.test(dict) && !/\/Filter\s*\[\s*\/DCTDecode\s*\]/.test(dict)) continue;
    const width = Number((dict.match(/\/Width\s+(\d+)/) || [])[1] || 0);
    const height = Number((dict.match(/\/Height\s+(\d+)/) || [])[1] || 0);
    if (Math.min(width, height) < 48) continue;
    const ratio = width / height;
    if (ratio < 0.5 || ratio > 2) continue;
    let start = streamAt + "stream".length;
    if (text[start] === "\r") start++;
    if (text[start] === "\n") start++;
    const len = Number((dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/) || [])[1] || 0);
    const end = len > 0 ? start + len : text.indexOf("endstream", start);
    if (end <= start) continue;
    const jpeg = buf.subarray(start, end);
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) continue; // not a JPEG after all
    if (!best || width * height > best.width * best.height) best = { jpeg: Buffer.from(jpeg), width, height };
  }
  return best;
}
