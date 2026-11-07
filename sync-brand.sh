#!/bin/sh
# Re-sync the final Mochi kit into public/ (renders downscaled to webp).
set -e
F=/workspace/floof/brand/dir-B-mochi/final
P=$(dirname "$0")/public
mkdir -p $P/mochi $P/icons $P/logo
cp $F/web/floof-mochi.glb $F/web/og-1200x630.png $P/
sed 's#"/icons/#"./icons/#g' $F/web/site.webmanifest > $P/site.webmanifest
cp $F/icons/* $P/icons/; cp $F/logo/*.svg $P/logo/
python3 - "$F" "$P" <<'PY'
import sys
from PIL import Image
F,P=sys.argv[1]+'/renders/',sys.argv[2]+'/mochi/'
for n in ['idle','countdown','puffed','happy','sleepy']:
    im=Image.open(F+f'mochi-{n}-2048.png')
    im.resize((1024,1024),Image.LANCZOS).save(P+f'{n}.webp',quality=88,method=6)
    im.resize((512,512),Image.LANCZOS).save(P+f'{n}-512.webp',quality=88,method=6)
Image.open(F+'mochi-hero-2560x1440-transparent.png').resize((1600,900),Image.LANCZOS).save(P+'hero-poster.webp',quality=86,method=6)
PY
