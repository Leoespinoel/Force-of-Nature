"""Builds bon-voyage/assets/remnant-loop.mp4 as a forward-only flight (owner, 21 Sep: "keeps going deeper and deeper and
doesn't go backwards ... as smooth as possible, no glitches no jumps"). It replaced the eased there-and-back loop of
sky-loop-build.py (kept as tools/masters/remnant-loop-pingpong.mp4).

The flight is a circle of four Seedance clips, described in sky-forward-join.py: the take, two forward extensions
(deeper, then through the blue core into teal gas) and a backward extension of the take (out of the gas, up to the
take's first frame). The last frame leads into the first, so the native loop wraps in mid-flight, between two
consecutive frames of the footage.

Step 1, segment A = take + first extension at 120fps (slow, about 2.5 minutes per second of footage):
  ffmpeg -i remnant-1.mp4 -i remnant-2-deeper.mp4 -filter_complex "[0:v]fps=24,format=yuv420p[a];[1:v]fps=24,format=yuv420p[b];[a][b]concat=n=2:v=1,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" -c:v libx264 -preset fast -crf 8 -pix_fmt yuv420p denseA.mp4
Step 2, segment C: python tools/sky-forward-join.py tools/masters <dir>, then the same minterpolate on each of
  segC-1/2/3.mp4 -> denseC-1/2/3.mp4 (side by side: minterpolate uses one core)
Step 3, one raw file of the whole circle, dense frame 5*i = real frame i (about 10GB; delete it after):
  A dense 0..2134 (take[0] up to the in-betweens before ext[-6]), C-1 dense 30..619, C-2 dense 30..619,
  C-3 dense 30..490 (= take[0] again, the closing frame). Segment C went through one more rgb->yuv round trip than A
  and comes back one level darker in every channel (measured, uniform from black to white), so it gets the level back:
  ffmpeg -i denseA.mp4   -vf "select=between(n\,0\,2134)" -vsync 0 -f rawvideo -pix_fmt rgb24 a.rgb
  ffmpeg -i denseC-1.mp4 -vf "select=between(n\,30\,619),format=rgb24,lutrgb=r=val+1:g=val+1:b=val+1" -vsync 0 -f rawvideo -pix_fmt rgb24 c1.rgb   (and so on)
  cat a.rgb c1.rgb c2.rgb c3.rgb > dense.rgb
Step 4: python tools/sky-forward-build.py remnant-loop.mp4 [speed] [crf]
  speed = flight speed against the footage (1.1 = a tenth faster than filmed), crf = x264 quality.
Check: python tools/sky-forward-verify.py, node tools/sky-loop-check.cjs

Sampling by motion, not by frame number. Two things make evenly spaced frames judder:
  - Seedance's own pacing: stretches of the approach clip come as a near-duplicate frame followed by a double step
    (measured steps 3.2, 0.3, 3.5, 0.1, 3.0, 0.1...), the dive has single duplicates, the take one 1.8x step near its end
  - minterpolate's in-between frames do not sit at even fifths (least motion next to a real frame)
So the build measures how much the picture changes across every dense interval and gives each interval a duration of
its change divided by the local average change (+-6 real frames): a duplicate takes no time, a double step takes twice
as long, and the flight's pacing over any half second stays what it was.
Even speed through the core: Seedance rushes through the core at about five times the flight's pace. Where the local
average change is over CAP, time is stretched in proportion (eased over about a second). The 120fps frames leave room
for that. The output step is then set so that a whole number of frames covers the circle exactly.

Tail: the file does not loop natively. Chrome's loop restart held a frame for 50ms on a desktop and froze for 500ms on
a throttled phone (measured), which the old loop hid by standing still at its wrap; this one wraps in mid-flight. So
the file carries on for TAIL seconds with its own opening again, and the page starts a second, hidden player from 0
while the first is in that tail, brings the two to the same frame and swaps them (skyLoop() in bon-voyage/index.html).
The opening and the tail get the same, slightly higher quality (crf 20 against 23) so the swap does not change the
texture. Not more: at crf 14 those stretches ran at 620kB/s against 140 for the rest, and the visible player dropped a
frame there in every run of the check (software decoding), besides making the file 8.4MB.
The loop's length is (frames - TAIL * 30) / 30 s; the page reads it as duration - TAIL.
"""
import subprocess, sys, math, os, bisect
from PIL import Image, ImageChops, ImageStat

FF = r"C:/Users/leono/AppData/Roaming/Python/Python310/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
dst = sys.argv[1]
SPEED = float(sys.argv[2]) if len(sys.argv) > 2 else 1.1
CRF = sys.argv[3] if len(sys.argv) > 3 else "23"
ZONE_CRF = 20                                              # quality of the opening and of the tail, see the end of the docstring
TAIL = 3                                                   # seconds of the opening repeated after the loop, see above
CAP = 2.6                                                  # most change allowed per real-frame time, on the scale of `change`
W, H, FPS, SRC_FPS, DENSE = 1280, 720, 30, 24, 5          # DENSE = dense frames per real frame (120 / 24)
fsz = W * H * 3

raw = os.path.join(os.path.dirname(os.path.abspath(dst)), "dense.rgb")
n = os.path.getsize(raw) // fsz
N = n - 1                                                  # dense intervals; the last dense frame is the first one again
print("dense frames:", n, " real frames:", N / DENSE)
fh = open(raw, "rb")
def frame(i):
    fh.seek(i * fsz); return Image.frombytes("RGB", (W, H), fh.read(fsz))

# change across every dense interval, mean abs difference at 320x180 (the scale every check here uses)
small = lambda i: frame(i).resize((320, 180), Image.BILINEAR).convert("L")
change, prev = [], small(0)
for i in range(1, n):
    cur = small(i); change.append(ImageStat.Stat(ImageChops.difference(prev, cur)).mean[0]); prev = cur
def smooth(v, span): return [sum(v[(i + d) % N] for d in range(-span, span + 1)) / (2 * span + 1) for i in range(N)]
local = smooth(change, 6 * DENSE)                          # average change per dense interval, +-6 real frames
stretch = smooth([max(1, a * DENSE / CAP) for a in local], 12 * DENSE)
dur = [c / a * s for c, a, s in zip(change, local, stretch)]   # duration of each dense interval, in dense-frame times
cum = [0.0]
for t in dur: cum.append(cum[-1] + t)
total = cum[-1]
print("longest stretch: %.2fx at real frame %d; circle lasts %.1f dense-frame times (%d as filmed)" % (max(stretch), stretch.index(max(stretch)) // DENSE, total, N))

K = int(round(total / (DENSE * SRC_FPS / FPS * SPEED)))
step = total / K                                           # frame K would land on the first frame again
print(f"loop {K} frames, {K / FPS:.4f}s, {(N / DENSE / SRC_FPS) / (K / FPS):.3f}x filmed on average; file {K + TAIL * FPS} frames with the tail")

def at(tau):
    i = min(bisect.bisect_right(cum, tau) - 1, N - 1)
    f = (tau - cum[i]) / dur[i] if dur[i] > 1e-9 else 0.0
    if f < 1e-3: return frame(i).tobytes()
    return Image.blend(frame(i), frame(i + 1), f).tobytes()

# one keyframe for the whole file and the same quality for every frame type (keyframes showed as texture pops), with
# extra quality for the opening and for the tail that repeats it
T = TAIL * FPS
X264 = f"keyint={K + T + 10}:min-keyint={K + T + 10}:scenecut=0:ipratio=1.0:pbratio=1.0:zones=0,{T + 15},crf={ZONE_CRF}/{K - 15},{K + T - 1},crf={ZONE_CRF}"
wr = subprocess.Popen([FF, "-v", "warning", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                       "-c:v", "libx264", "-preset", "slow", "-crf", CRF, "-pix_fmt", "yuv420p", "-profile:v", "high",
                       "-x264-params", X264, "-movflags", "+faststart", "-an", dst], stdin=subprocess.PIPE)
for k in range(K + T):
    wr.stdin.write(at((k % K) * step))
wr.stdin.close(); wr.wait()
print("wrote", dst)
