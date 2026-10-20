import sys, json, os, shutil
from multiprocessing import Process
from playwright.sync_api import sync_playwright
W = '/tmp/v0503/work/'
FR = '/tmp/v0503/frames/'
EXE = '/home/apibase/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
FPS = 30
TOTAL = 79
def build():
    r = json.load(open(W + 'rects.json'))
    h = open(W + 'stage.html').read().replace('__RECTS__', json.dumps(r))
    open(W + 'stage_built.html', 'w').write(h)
def work(frames):
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path=EXE, args=['--force-color-profile=srgb'])
        pg = br.new_page(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
        pg.on('pageerror', lambda e: print('PAGEERR', e))
        pg.goto('file://' + W + 'stage_built.html'); pg.wait_for_timeout(1500)
        for i in frames:
            pg.evaluate('t => setT(t)', i / FPS)
            pg.screenshot(path=FR + '%05d.jpg' % i, type='jpeg', quality=94)
        br.close()
if __name__ == '__main__':
    build()
    if len(sys.argv) > 1 and sys.argv[1] == 'one':
        os.makedirs(FR, exist_ok=True)
        for t in sys.argv[2:]:
            pass
        work([int(float(t) * FPS) for t in sys.argv[2:]]); sys.exit()
    shutil.rmtree(FR, ignore_errors=True); os.makedirs(FR)
    n = TOTAL * FPS
    ps = [Process(target=work, args=(list(range(k, n, 4)),)) for k in range(4)]
    [x.start() for x in ps]; [x.join() for x in ps]
