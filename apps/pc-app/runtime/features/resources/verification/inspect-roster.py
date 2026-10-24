"""Read-only image QA and Pixi trim-rectangle export. Does not alter image pixels."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image

sources = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
report = []

def gap(projection, expected, radius):
    start, end = max(1, round(expected-radius)), min(len(projection)-2, round(expected+radius))
    candidates = [(int(projection[max(0,x-1):x+2].sum()), abs(x-expected), x) for x in range(start,end+1)]
    score, _, position = min(candidates)
    return position, score

for source in sources:
    image = Image.open(source['path']).convert('RGBA')
    rgba = np.asarray(image)
    alpha = rgba[:,:,3]
    ink = alpha >= 128
    width, height = image.size
    row_choices = [gap(ink.sum(axis=1), height*i/4, height*.065) for i in (1,2,3)]
    rows = [0] + [item[0] for item in row_choices] + [height]
    frames, columns, seams = [], [], [item[1] for item in row_choices]
    for row in range(4):
        top, bottom = rows[row:row+2]
        choices = [gap(ink[top:bottom].sum(axis=0), width*i/4, width*.065) for i in (1,2,3)]
        cuts = [0] + [item[0] for item in choices] + [width]
        columns.append(cuts)
        seams.extend(item[1] for item in choices)
        for column in range(4):
            left, right = cuts[column:column+2]
            y, x = np.nonzero(ink[top:bottom,left:right])
            if not len(x):
                raise ValueError(f"Empty frame: {source['id']} / {row*4+column}")
            x0, y0 = max(left,left+int(x.min())-3), max(top,top+int(y.min())-3)
            x1, y1 = min(right,left+int(x.max())+4), min(bottom,top+int(y.max())+4)
            frames.append({'index':row*4+column,'x':x0,'y':y0,'w':x1-x0,'h':y1-y0,
                           'region':[left,top,right,bottom],
                           'pixelSha256':hashlib.sha256(rgba[y0:y1,x0:x1].tobytes()).hexdigest()})
    report.append({'id':source['id'],'source':source['path'],'width':width,'height':height,
                   'sha256':hashlib.sha256(Path(source['path']).read_bytes()).hexdigest(),
                   'transparentFraction':float((alpha==0).mean()),'opaqueFraction':float((alpha>200).mean()),
                   'rows':rows,'columns':columns,'seamInk':seams,'allSeamsClear':max(seams)==0,
                   'uniqueFrames':len(set(frame['pixelSha256'] for frame in frames)),'frames':frames})
Path(sys.argv[2]).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{'id':item['id'],'size':[item['width'],item['height']],
                   'rows':item['rows'],'maxSeamInk':max(item['seamInk']),
                   'uniqueFrames':item['uniqueFrames'],
                   'maxFrame':[max(f['w'] for f in item['frames']),max(f['h'] for f in item['frames'])]}
                  for item in report],ensure_ascii=False))
