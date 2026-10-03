import sys,pathlib
r=pathlib.Path(__file__).parent
exec(compile((r/'inspect_source.py').read_text(),'inspect_source.py','exec'))
sys.argv=['blender','--',str(r)]
exec(compile((r/'inspect_exact_hulls.py').read_text(),'inspect_exact_hulls.py','exec'))
