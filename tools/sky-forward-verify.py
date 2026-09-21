"""Is the supernova sky's loop one smooth forward flight? Reads the finished file, no browser.
  python tools/sky-forward-verify.py [bon-voyage/assets/remnant-loop.mp4]
The file is the loop plus TAIL seconds of its own opening again (see sky-forward-build.py); the loop is judged on its
own frames, with the wrap taken from its last frame to frame 0, and the tail is checked against the opening.
Reports
  steps   how much the picture changes from each frame to the next (mean abs difference at 320x180), including the
          wrap (last frame of the loop -> first). A jump shows as one step far above its neighbours, a stall as one far below.
  tail    each tail frame against its twin in the opening: must be well under one frame step, or the swap would show
  wrap    the wrap's step against the steps either side of it
  luma    brightest and darkest frame (the pass through the core must not flash behind the headline)
  zoom    for every half second, the scale that best maps a frame onto the one half a second later, fitted on edges.
          Over 1 = flying forward, under 1 = backwards. Inside featureless gas there is nothing to fit, so values there
          mean little; those stretches are marked "soft" (few edges).
"""
import subprocess, sys
from PIL import Image, ImageChops, ImageStat, ImageFilter

FF = r"C:/Users/leono/AppData/Roaming/Python/Python310/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
src = sys.argv[1] if len(sys.argv) > 1 else "bon-voyage/assets/remnant-loop.mp4"
W, H = 320, 180
d = subprocess.run([FF, "-v", "error", "-i", src, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE, check=True).stdout
F = [Image.frombytes("L", (W, H), d[i * W * H:(i + 1) * W * H]) for i in range(len(d) // (W * H))]
TAIL = 3 * 30
tail, F = F[len(F) - TAIL:], F[:len(F) - TAIL]
n = len(F); print(n, "frames in the loop,", round(n / 30, 4), "s, plus", TAIL, "of tail")
diff = lambda a, b: ImageStat.Stat(ImageChops.difference(a, b)).mean[0]
st = [diff(F[i], F[(i + 1) % n]) for i in range(n)]       # st[n-1] is the wrap
srt = sorted(st); med = srt[n // 2]
print("steps: median %.2f, min %.2f, max %.2f" % (med, srt[0], srt[-1]))
# a jump or stall = a step unlike the average of its four neighbours
odd = []
for i in range(n):
    nb = [st[(i + k) % n] for k in (-2, -1, 1, 2)]; m = sum(nb) / 4
    if st[i] > 1.6 * m + 0.3 or st[i] < 0.45 * m - 0.1: odd.append((i, round(st[i], 2), round(m, 2)))
print("steps unlike their neighbours (frame, step, neighbours):", odd or "none")
print("wrap: %.2f, before it %s, after it %s" % (st[n - 1], [round(v, 2) for v in st[n - 4:n - 1]], [round(v, 2) for v in st[0:3]]))
tw = [diff(a, b) for a, b in zip(tail, F)]
print("tail vs opening: mean %.2f, max %.2f (one frame step there: %.2f)" % (sum(tw) / TAIL, max(tw), sum(st[:TAIL]) / TAIL))
lum = [ImageStat.Stat(f).mean[0] for f in F]
print("luma: darkest %.0f, brightest %.0f (frame %d)" % (min(lum), max(lum), lum.index(max(lum))))

box = (50, 28, 270, 152)
def warp(a, s): return a.transform(a.size, Image.AFFINE, (1 / s, 0, W / 2 - W / 2 / s, 0, 1 / s, H / 2 - H / 2 / s), Image.BILINEAR)
edges = lambda a: a.filter(ImageFilter.GaussianBlur(1)).filter(ImageFilter.FIND_EDGES)
out = []
for i in range(0, n, 15):
    a, b = edges(F[i]), edges(F[(i + 15) % n])
    soft = ImageStat.Stat(a.crop(box)).mean[0] < 2.5       # measured: cloud 2.8-4.0, gas and the core's glow 1.8-2.2
    s = min((ImageStat.Stat(ImageChops.difference(warp(a, 1 + k * 0.005).crop(box), b.crop(box))).mean[0], 1 + k * 0.005) for k in range(-12, 25))[1]
    out.append(("%.3f" % s) + ("~" if soft else ""))
print("zoom per half second (~ = soft, little to fit):", " ".join(out))
back = [o for o in out if not o.endswith("~") and float(o) < 1]
print("backwards stretches with detail:", back or "none")
