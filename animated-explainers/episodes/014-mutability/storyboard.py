"""Project the measured edit list into a readable, frame-accurate storyboard."""
import json
from pathlib import Path

here = Path(__file__).resolve().parent
def timecode(frame):
    seconds, frames = divmod(frame, 30)
    minutes, seconds = divmod(seconds, 60)
    return f'{minutes:02}:{seconds:02}:{frames:02}'

def write_storyboard():
    rows = ['# Mutability · timed storyboard', '', 'Times are minutes, seconds and frames at 30 fps. Each line begins at the indicated frame. The moving picture interpolates within its cue. The lecture excerpt in scene 16 is voiced by George. Emma reads the surrounding narration.', '']
    for scene in json.loads((here / 'scenes.json').read_text()):
        rows.extend([f"## {scene['number']:02} · {scene['title']}", '', '| In | Picture | Spoken line |', '| --- | --- | --- |'])
        rows.extend(f"| {timecode(c['frame'])} | {c['action']} | {c['text']} |" for c in scene['cues'])
        rows.append('')
    (here / 'storyboard.md').write_text('\n'.join(rows)+'\n')

if __name__ == '__main__':
    write_storyboard()
