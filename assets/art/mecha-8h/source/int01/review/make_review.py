from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json, hashlib
ROOT=Path(__file__).resolve().parents[1]
REF=Path('/workspace/shared/skywind-reference-8f9277c')
enemy=Image.open(ROOT/'renders/int01-neutral.png').convert('RGBA')
player=Image.open(REF/'sv01_bank_10_neutral_0.png').convert('RGBA')
try:
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
    small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
except OSError: font=small=ImageFont.load_default()
sheet=Image.new('RGB',(840,710),(14,22,34)); d=ImageDraw.Draw(sheet)
d.text((20,14),'INT-01 / ACTUAL 3D REPRESENTATIVE',fill=(231,243,250),font=font)
d.text((20,38),'Review only | native Cycles RGBA | no thrust flame | fixed camera',fill=(164,188,208),font=small)
sheet.paste(player.resize((320,320),Image.Resampling.LANCZOS),(35,-10),player.resize((320,320),Image.Resampling.LANCZOS))
sheet.paste(enemy,(438,-22),enemy)
d.text((30,248),'Unchanged SV-01 reference / faces right',fill=(177,199,217),font=small)
d.text((446,248),'INT-01 neutral / faces left',fill=(177,199,217),font=small)
for i,(fn,label) in enumerate([('11-final-controlled-day.jpg','DAY'),('10-final-controlled-night.jpg','NIGHT')]):
    # Reference game backgrounds are retained unedited apart from this local crop.
    bg=Image.open(REF/fn).convert('RGBA').crop((392,355,1192,535))
    py=player.resize((106,106),Image.Resampling.LANCZOS); en=enemy.resize((87,87),Image.Resampling.LANCZOS)
    bg.alpha_composite(py,(175,20)); bg.alpha_composite(en,(503,30))
    dd=ImageDraw.Draw(bg); dd.text((12,10),label+' / 1 pixel = 1 game unit',fill='white',font=small)
    dd.text((155,135),'SV-01 canvas 106',fill='white',font=small)
    dd.text((469,135),'beetle canvas 87',fill='white',font=small)
    y=285+i*197; sheet.paste(bg.convert('RGB'),(20,y))
    bg.save(ROOT/'review'/('concept-fit-'+label.lower()+'.png'))
d=ImageDraw.Draw(sheet); d.text((20,683),'CONCEPT-FIT COMPOSITE ON HISTORICAL BACKGROUNDS. Not a game execution screenshot.',fill=(191,207,221),font=small)
sheet.save(ROOT/'review/int01-review.png')
print(json.dumps({'RGBA_size':enemy.size,'alpha_bbox':enemy.getbbox(),'source_pixels_unchanged':hashlib.sha256((REF/'sv01_bank_10_neutral_0.png').read_bytes()).hexdigest()},indent=2))
