"""Time each visual action to its spoken line, and build the Studio soundtrack."""
import argparse
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from kokoro_onnx import Kokoro

here = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(here.parent / '003-beyond-the-hierarchy'))
from narrate import encode_studio_audio, trim_silence

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('model_dir', type=Path)
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
engine = Kokoro(str(args.model_dir / 'kokoro-v1.0.onnx'), str(args.model_dir / 'voices-v1.0.bin'))
rate, fps = 24000, 30
sections = re.split(r'^## (\d+) · (.+)$', (here / 'script.md').read_text(), flags=re.M)[1:]
scenes, audio = [], []
frame = 0
for num, title, body in zip(sections[::3], sections[1::3], sections[2::3]):
    scene = dict(number=int(num), title=title, frame=frame, cues=[])
    frame += 36 if num == '01' else 12
    for i, (action, line) in enumerate(re.findall(r'^- (.+?) \| (.+)$', body, re.M)):
        voice = 'bm_george' if num == '16' and i == 1 else 'bf_emma'
        samples, sr = engine.create(line, voice=voice, lang='en-gb', speed=1.0)
        assert sr == rate
        samples = trim_silence(samples, sr)
        frames = math.ceil(len(samples) * fps / rate)
        scene['cues'].append(dict(frame=frame, speechFrames=frames, action=action, text=line))
        audio.append((frame * rate // fps, samples))
        frame += frames + (37 if (num, i) in [('06',4),('08',4),('16',5),('19',6)] else 13)
    frame += 65 if num == '20' else 27
    scene['end'] = frame
    scenes.append(scene)
    print(num, title, frame / fps, flush=True)

track = np.zeros(math.ceil(frame / fps) * rate, dtype=np.float32)
for offset, samples in audio:
    track[offset:offset+len(samples)] = samples
encode_studio_audio(track, rate, here.parent.parent / 'public/014-mutability.m4a', args.ffmpeg)
meta = dict(id='014-mutability', title='Mutability', number='014', volume='IV — From Text to Intelligence',
            width=1080, height=1080, fps=fps, durationSeconds=len(track)//rate)
(here/'metadata.json').write_text(json.dumps(meta, indent=2) + '\n')
(here/'scenes.json').write_text(json.dumps(scenes, indent=2, ensure_ascii=False) + '\n')
from storyboard import write_storyboard
write_storyboard()
