"""Builds bon-voyage/assets/remnant-loop.mp4, the supernova sky's seamless loop, from the Seedance master.

Step 1 (slow, about 12 minutes): interpolate the 24fps master to a dense 120fps clip
  ffmpeg -i tools/masters/remnant-1.mp4 -vf "minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"          -c:v libx264 -preset fast -crf 8 -pix_fmt yuv420p dense120.mp4
  (of five settings tried, this one kept sharpness steadiest between real frames: a 2.4% dip, against 5% for the rest)
Step 2: python tools/sky-loop-build.py dense120.mp4 remnant-loop.mp4 720 22 "keyint=1440:min-keyint=1440:scenecut=0:ipratio=1.0:pbratio=1.0:zones=0,30,crf=10/1400,1439,crf=10"
  720 = frames each way (12s out, 12s back at 60fps). The zones spend extra quality on the first and last half second, so
  the last frame matches the first in texture too (seam 0.16 on the check's scale, against 0.45 without and 28.7 for the
  old clip's end-to-start jump). Needs Pillow, and about 2.6GB of disk for dense.rgb next to the output (delete it after).
Check: node tools/sky-loop-check.cjs

Eased there-and-back loop from a dense (120fps) interpolated clip.

Output frame k of the forward half samples the dense clip at  p = (1 - cos(pi * k / HALF)) / 2 * (N - 1),
blending the two neighbouring dense frames for the fraction, so the flight eases out of a standstill, peaks mid-way and
eases back to a standstill. The backward half is the forward half mirrored. The loop wraps where the speed is zero and
the last frame equals the first.
"""
import subprocess, sys, math
from PIL import Image

FF = r"C:/Users/leono/AppData/Roaming/Python/Python310/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
src, dst = sys.argv[1], sys.argv[2]
HALF = int(sys.argv[3]) if len(sys.argv) > 3 else 720   # output frames per direction (60fps)
CRF = sys.argv[4] if len(sys.argv) > 4 else "23"
# one keyframe for the whole loop and the same quality for every frame type: at keyint 120 each keyframe showed as a small
# texture pop (measured), and the wrap, where the picture stands still, was one of them
X264 = sys.argv[5] if len(sys.argv) > 5 else "keyint=1440:min-keyint=1440:scenecut=0:ipratio=1.0:pbratio=1.0"
W, H, FPS = 1280, 720, 60
fsz = W * H * 3

# dense frames into one raw file on disk (too big for RAM comfortably), then seek into it
import os
raw = os.path.join(os.path.dirname(os.path.abspath(dst)), "dense.rgb")
if not os.path.exists(raw): subprocess.run([FF, "-v", "error", "-y", "-i", src, "-frames:v", "948", "-f", "rawvideo", "-pix_fmt", "rgb24", raw], check=True)
import os
n = os.path.getsize(raw) // fsz
print("dense frames:", n)
fh = open(raw, "rb")
def frame(i):
    fh.seek(i * fsz); return fh.read(fsz)

def sample(p):
    i = int(math.floor(p)); f = p - i
    if i >= n - 1: return frame(n - 1)
    if f < 1e-4: return frame(i)
    a = Image.frombytes("RGB", (W, H), frame(i)); b = Image.frombytes("RGB", (W, H), frame(i + 1))
    return Image.blend(a, b, f).tobytes()

wr = subprocess.Popen([FF, "-v", "warning", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                       "-c:v", "libx264", "-preset", "slow", "-crf", CRF, "-pix_fmt", "yuv420p", "-profile:v", "high",
                       "-x264-params", X264, "-movflags", "+faststart", "-an", dst], stdin=subprocess.PIPE)
# forward: k = 0..HALF-1, backward: k = HALF..1  -> 2*HALF frames, and frame 2*HALF would equal frame 0
order = list(range(0, HALF)) + list(range(HALF, 0, -1))
# minterpolate's in-between frames do not sit at 1/5, 2/5... of the way between two real frames: measured over the whole
# clip they move least next to a real frame and most in the middle. POS is where each one really sits (measured step
# shares, corrected for the same measure taken on a plain linear blend), so the clip is sampled by position, not index.
POS = [0, .134, .358, .636, .850, 1]
def dense_index(p):
    s, u = divmod(p / 5, 1)
    j = max(i for i in range(5) if POS[i] <= u)
    return 5 * s + j + (u - POS[j]) / (POS[j + 1] - POS[j])
for k in order:
    p = (1 - math.cos(math.pi * k / HALF)) / 2 * (n - 1)
    wr.stdin.write(sample(dense_index(p)))
wr.stdin.close(); wr.wait()
print("wrote", dst, len(order), "frames,", len(order) / FPS, "s")
