/**
 * Conversores: result JSON do WhisperX -> SRT, VTT, TXT
 */

function pad(n, size = 2) {
  return String(n).padStart(size, '0');
}

function secondsToSrtTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function secondsToVttTimestamp(seconds) {
  return secondsToSrtTimestamp(seconds).replace(',', '.');
}

function escapeSrtText(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

function toSrt(result) {
  const segments = result?.segments || [];
  const lines = [];
  segments.forEach((seg, idx) => {
    const text = escapeSrtText(seg.text);
    if (!text) return;
    lines.push(String(idx + 1));
    lines.push(`${secondsToSrtTimestamp(seg.start)} --> ${secondsToSrtTimestamp(seg.end)}`);
    lines.push(text);
    lines.push('');
  });
  return lines.join('\n');
}

function toVtt(result) {
  const segments = result?.segments || [];
  const out = ['WEBVTT', ''];
  segments.forEach((seg) => {
    const text = escapeSrtText(seg.text);
    if (!text) return;
    out.push(`${secondsToVttTimestamp(seg.start)} --> ${secondsToVttTimestamp(seg.end)}`);
    out.push(text);
    out.push('');
  });
  return out.join('\n');
}

function toTxt(result) {
  const segments = result?.segments || [];
  return segments
    .map((seg) => escapeSrtText(seg.text))
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  toSrt,
  toVtt,
  toTxt,
  secondsToSrtTimestamp,
  secondsToVttTimestamp,
};
