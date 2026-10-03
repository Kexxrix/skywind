from pathlib import Path
D=Path(__file__).resolve().parent
for role in ['mantis','needle']:
 p=D/role/'generator.py'
 exec(compile(p.read_text(),str(p),'exec'),{'__file__':str(p),'__name__':'__main__'})
print('MANTIS NEEDLE 2 IDLE COMPLETE')
