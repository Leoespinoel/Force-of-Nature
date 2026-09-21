"""Closing segment ("C") of the supernova sky's forward-only flight (see sky-forward-build.py), at 24fps.

The flight is a circle of four Seedance clips (tools/masters), all 1280x720 24fps:
  remnant-1.mp4          the take: flying into the remnant towards its blue core
  remnant-2-deeper.mp4   video_extension forward of the take: on towards the core
  remnant-3-dive.mp4     video_extension forward of that: through the core and out into dark teal gas
  remnant-0-approach.mp4 video_extension BACKWARD of the take: out of teal gas, the red clouds appear small and far
                         ahead and grow until the footage runs into the take's first frame
Extensions join the clip they extend to the frame (measured steps across those three joins: 2.4, 1.0 and 1.7, inside
the flight's normal range), so nothing is blended where there is detail to see. The one join that Seedance did not
make, dive -> approach, is a 2s crossfade between two fields of soft teal gas, both flying forward.
(A first build closed the circle with a start_image/end_image clip instead; Seedance honours those images only
roughly, 8-16px off and a few frames short, so both of its joins needed aligned blends over sharp cloud. Dropped.)

  python tools/sky-forward-join.py <masters dir> <out dir>
writes segC-1.mp4, segC-2.mp4, segC-3.mp4 (overlapping thirds, so they can be interpolated side by side) and
profile.json (how much the picture moves from each real frame of the whole circle to the next; the build uses it to
hold the flight's speed even through the core).

Layout of C (frame indices): 0-11 ext[-12..-1] (context, overlaps segment A), 12-141 dive[0..129], 142-189 the
crossfade dive[130..177] x approach[0..47], 190-333 approach[48..191], 334-346 take[0..12] (334 = the circle's first
frame again). Thirds: frames 0-130, 118-248, 236-346.

Grade: the dive passes through the core as a near-white screen (mean luma 210 against 30-66 for the rest of the
flight), which would flash behind the hero headline every half minute. Above a mean luma of 75 a frame is scaled down
towards 75 + 0.2 * (luma - 75), red much harder than green and blue lifted against it, so the passage reads as the
core's own electric blue (a plain scale turned the white into flat grey-green fog), with the scale smoothed over 13
frames. Frames under 75 are untouched, so the segment still meets segment A exactly.
"""
import subprocess, sys, os, json
from PIL import Image, ImageChops, ImageStat

FF = r"C:/Users/leono/AppData/Roaming/Python/Python310/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
W, H = 1280, 720
fsz = W * H * 3
src, out_dir = sys.argv[1], sys.argv[2]

def frames(name):
    d = subprocess.run([FF, "-v", "error", "-i", os.path.join(src, name), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE, check=True).stdout
    return [Image.frombytes("RGB", (W, H), d[i * fsz:(i + 1) * fsz]) for i in range(len(d) // fsz)]

take, ext, dive, back = frames("remnant-1.mp4"), frames("remnant-2-deeper.mp4"), frames("remnant-3-dive.mp4"), frames("remnant-0-approach.mp4")
print("frames:", len(take), len(ext), len(dive), len(back))

ss = lambda t: 0 if t <= 0 else 1 if t >= 1 else t * t * (3 - 2 * t)
CTX, CUT, XF = 12, 130, 48
seg = list(ext[-CTX:]) + dive[:CUT]
seg += [Image.blend(dive[CUT + j], back[j], ss((j + 1) / (XF + 1))) for j in range(XF)]
seg += back[XF:] + take[:CTX + 1]
FIRST = CTX + CUT + XF + len(back) - XF                    # index of take[0] in C
print("segment C:", len(seg), "frames, take[0] at", FIRST)

# highlight roll-off, smoothed over time
small = [f.resize((320, 180), Image.BILINEAR) for f in seg]
luma = [ImageStat.Stat(s.convert("L")).mean[0] for s in small]
KNEE, SLOPE, SPAN = 75, 0.2, 6
SPLIT = (-1.1, -.25, .6)                                   # per channel, how much harder (or softer) than the scale itself
k = [1 if m <= KNEE else (KNEE + SLOPE * (m - KNEE)) / m for m in luma]
k = [sum(k[max(0, i - SPAN):i + SPAN + 1]) / len(k[max(0, i - SPAN):i + SPAN + 1]) for i in range(len(k))]
for i, f in enumerate(seg):
    if k[i] < 0.995:
        q = [k[i] * (1 + s * (1 - k[i])) for s in SPLIT]
        seg[i] = Image.merge("RGB", [c.point(lambda v, q=qq: min(255, int(v * q + .5))) for c, qq in zip(f.split(), q)])
        small[i] = seg[i].resize((320, 180), Image.BILINEAR)
print("brightest frame after grade:", round(max(ImageStat.Stat(s.convert("L")).mean[0] for s in small)))

# how much the picture moves from each real frame of the circle to the next: take, ext up to C's context, then C
def steps(fs): return [ImageStat.Stat(ImageChops.difference(a.convert("L"), b.convert("L"))).mean[0] for a, b in zip(fs, fs[1:])]
sm = lambda fs: [f.resize((320, 180), Image.BILINEAR) for f in fs]
a_part = sm(take) + sm(ext[:len(ext) - CTX + 1])           # take[0] .. ext[-12]
prof = steps(a_part) + steps(small[:FIRST + 1])            # .. ext[-12] -> ... -> take[0]
json.dump({"steps": [round(v, 3) for v in prof]}, open(os.path.join(out_dir, "profile.json"), "w"))
print("circle:", len(prof), "real frames,", round(len(prof) / 24, 2), "s of footage")

for n, (a, b) in enumerate(((0, 130), (118, 248), (236, len(seg) - 1)), 1):
    wr = subprocess.Popen([FF, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "24", "-i", "-",
                           "-c:v", "libx264", "-preset", "fast", "-crf", "6", "-pix_fmt", "yuv444p", os.path.join(out_dir, f"segC-{n}.mp4")], stdin=subprocess.PIPE)
    for f in seg[a:b + 1]: wr.stdin.write(f.tobytes())
    wr.stdin.close(); wr.wait()
