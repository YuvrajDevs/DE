"""Convert single-quoted JS strings that contain «code with 'quotes'» into template literals."""
import re, subprocess, sys
path = sys.argv[1]
for _ in range(200):
    r = subprocess.run(['node', '-e', f"require('{path}')"], capture_output=True, text=True)
    if r.returncode == 0:
        print('ok', path); break
    m = re.search(r':(\d+)\n(.*)\n(\s*)\^', r.stderr)
    if not m: print(r.stderr[:800]); break
    ln = int(m.group(1)) - 1; col = len(m.group(3))
    lines = open(path).read().split('\n')
    line = lines[ln]
    # find the string literal that starts at or before col
    start = line.rfind("'", 0, col + 1)
    if start < 0: print('cannot fix', line); break
    i, g = start + 1, False
    while i < len(line):
        ch = line[i]
        if ch == '«': g = True
        elif ch == '»': g = False
        elif ch == '\\': i += 2; continue
        elif ch == "'" and not g: break
        i += 1
    body = line[start + 1:i].replace("\\'", "'").replace('`', '\\`')
    lines[ln] = line[:start] + '`' + body + '`' + line[i + 1:]
    open(path, 'w').write('\n'.join(lines))
