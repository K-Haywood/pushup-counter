import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import type { BodySide } from '../types/app';

const CONNECTIONS: Array<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 31],
  [28, 32]
];

const LEFT_POINTS = new Set([11, 13, 15, 23, 25, 27, 31]);
const RIGHT_POINTS = new Set([12, 14, 16, 24, 26, 28, 32]);

export function drawPoseOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  result: PoseLandmarkerResult | null,
  highlightedSide: BodySide | null
): void {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);

  if (!result || result.landmarks.length === 0) {
    return;
  }

  const pose = result.landmarks[0];
  context.lineWidth = Math.max(2, width * 0.004);
  context.lineCap = 'round';

  for (const [fromIndex, toIndex] of CONNECTIONS) {
    const from = pose[fromIndex];
    const to = pose[toIndex];
    if (!from || !to) {
      continue;
    }

    const isHighlighted =
      highlightedSide === 'left'
        ? LEFT_POINTS.has(fromIndex) && LEFT_POINTS.has(toIndex)
        : highlightedSide === 'right'
          ? RIGHT_POINTS.has(fromIndex) && RIGHT_POINTS.has(toIndex)
          : false;

    context.strokeStyle = isHighlighted ? 'rgba(132, 255, 173, 0.95)' : 'rgba(148, 163, 184, 0.65)';
    context.beginPath();
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
    context.stroke();
  }

  for (let index = 0; index < pose.length; index += 1) {
    const point = pose[index];
    const isHighlighted =
      highlightedSide === 'left'
        ? LEFT_POINTS.has(index)
        : highlightedSide === 'right'
          ? RIGHT_POINTS.has(index)
          : false;

    context.fillStyle = isHighlighted ? '#84ffad' : '#f8fafc';
    context.beginPath();
    context.arc(point.x * width, point.y * height, Math.max(3, width * 0.006), 0, Math.PI * 2);
    context.fill();
  }
}
