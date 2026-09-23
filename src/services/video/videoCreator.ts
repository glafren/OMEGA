import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
const WIDTH = 750;
const HEIGHT = 1000;
const FPS = 30;

export const TRANSITION_SECONDS = 0.6;

export function calculateSlideDuration(imageCount: number, totalDurationSeconds: number) {
  if (imageCount < 1) throw new Error("Video için en az bir görsel gerekli.");
  if (totalDurationSeconds < 10) throw new Error("Video süresi en az 10 saniye olmalı.");
  return (totalDurationSeconds + TRANSITION_SECONDS * (imageCount - 1)) / imageCount;
}

function buildFilter(imageCount: number, slideDuration: number, totalDurationSeconds: number) {
  const inputs = Array.from({ length: imageCount }, (_, index) =>
    `[${index}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${index}]`,
  );

  if (imageCount === 1) return `${inputs[0]};[v0]trim=duration=${totalDurationSeconds}[video]`;

  const transitions: string[] = [];
  let previous = "v0";
  for (let index = 1; index < imageCount; index++) {
    const output = index === imageCount - 1 ? "video" : `x${index}`;
    const offset = index * (slideDuration - TRANSITION_SECONDS);
    transitions.push(`[${previous}][v${index}]xfade=transition=fade:duration=${TRANSITION_SECONDS}:offset=${offset.toFixed(3)}[${output}]`);
    previous = output;
  }
  return [...inputs, ...transitions].join(";");
}

export async function createProductVideo(imagePaths: string[], outputPath: string, totalDurationSeconds: number) {
  if (!ffmpegPath) throw new Error("FFmpeg çalıştırılabilir dosyası bulunamadı.");
  const slideDuration = calculateSlideDuration(imagePaths.length, totalDurationSeconds);
  const args = ["-y", "-nostdin", "-hide_banner", "-loglevel", "error"];
  for (const imagePath of imagePaths) args.push("-loop", "1", "-t", slideDuration.toFixed(3), "-i", imagePath);
  args.push(
    "-filter_complex", buildFilter(imagePaths.length, slideDuration, totalDurationSeconds),
    "-map", "[video]", "-t", String(totalDurationSeconds),
    "-c:v", "libx264", "-preset", "medium", "-crf", "22",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", outputPath,
  );
  await execFileAsync(ffmpegPath, args, { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
}
