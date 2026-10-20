import json, sys
from playwright.sync_api import sync_playwright

OUT = '/tmp/v0503/work/'
rects = {}

def R(page, sel, key, nth=0):
    loc = page.locator(sel)
    if loc.count() <= nth:
        print('MISSING', key, sel)
        return
    b = loc.nth(nth).bounding_box()
    rects[key] = {'x': b['x'], 'y': b['y'], 'w': b['width'], 'h': b['height']}

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/home/apibase/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell')
    ctx = br.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=2, color_scheme='dark', reduced_motion='reduce')
    pg = ctx.new_page()

    pg.goto('https://apibase.pro/integrator', wait_until='networkidle')
    pg.wait_for_timeout(800)
    R(pg, '.lp-hero h1', 'int_h1'); R(pg, '.lp-visual', 'int_chat'); R(pg, '.lp-hero .lp-cta', 'int_cta')
    R(pg, '.lp-paid', 'int_paid')
    pg.screenshot(path=OUT + 's2.png')
    open(OUT + 'int_text.txt', 'w').write(pg.inner_text('body'))

    # connect: step 1 filled (typing is animated in the stage; here a filled capture + empty capture)
    pg.goto('https://apibase.pro/integrator/connect', wait_until='networkidle')
    pg.wait_for_timeout(800)
    pg.screenshot(path=OUT + 's3_empty.png', full_page=True)
    R(pg, '#s1', 'c_s1')
    for n in ('name', 'site_url', 'category', 'slug'):
        R(pg, '[name=%s]' % n, 'c_' + n)
    R(pg, '#bar', 'c_bar'); R(pg, '#pv', 'c_pv'); R(pg, 'p.muted', 'c_page')
    pg.fill('[name=name]', 'Northside Kicks')
    pg.fill('[name=site_url]', 'https://northside-kicks.example')
    pg.select_option('[name=category]', 'footwear')
    pg.fill('[name=slug]', 'northside-kicks')
    pg.wait_for_timeout(400)
    for n in ('name', 'site_url', 'category', 'slug'):
        R(pg, '[name=%s]' % n, 'c_' + n + '_f')
    R(pg, '#pv', 'c_pv_f'); R(pg, '#s1 p.muted', 'c_page_f')
    pg.screenshot(path=OUT + 's3_filled.png', full_page=True)
    pg.fill('[name=name]', ''); pg.fill('[name=site_url]', ''); pg.fill('[name=slug]', ''); pg.select_option('[name=category]', index=0)
    pg.wait_for_timeout(400)
    for n in ('name', 'site_url', 'category', 'slug'):
        R(pg, '[name=%s]' % n, 'c_' + n + '_e')
    R(pg, '#s1 p.muted', 'c_page_e')
    pg.screenshot(path=OUT + 's3_empty.png', full_page=True)
    pg.fill('[name=name]', 'Northside Kicks')
    pg.fill('[name=site_url]', 'https://northside-kicks.example')
    pg.select_option('[name=category]', 'footwear')
    pg.fill('[name=slug]', 'northside-kicks')
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.activeElement && document.activeElement.blur()")
    pg.wait_for_timeout(300)
    print('colors', pg.evaluate("() => { const i=getComputedStyle(document.querySelector('[name=name]')); const b=getComputedStyle(document.body); return [i.backgroundColor,i.borderColor,i.color,b.backgroundColor]; }"))
    print('pv text:', pg.inner_text('#pv'))
    # step 2 / 3 by toggling visibility only (no navigation click, no submit)
    pg.evaluate("""() => {
      document.getElementById('s1').hidden = true; document.getElementById('s2').hidden = false;
      const li = document.querySelectorAll('#bar li'); li.forEach(x => x.classList.remove('on')); li[1].classList.add('on');
      document.querySelector('#s2 [name=accept]').checked = false; }""")
    pg.wait_for_timeout(800)
    R(pg, '#s2 .cn-check', 'c_accept'); R(pg, '#s2 [name=accept]', 'c_box'); R(pg, '#s2 h2', 'c_s2h')
    pg.screenshot(path=OUT + 's4_unticked.png', full_page=True)
    pg.evaluate("() => { document.querySelector('#s2 [name=accept]').checked = true; }")
    pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 's4_ticked.png', full_page=True)
    open(OUT + 'c_s2_text.txt', 'w').write(pg.inner_text('#s2'))
    pg.evaluate("""() => {
      document.getElementById('s2').hidden = true; document.getElementById('s3').hidden = false;
      const li = document.querySelectorAll('#bar li'); li.forEach(x => x.classList.remove('on')); li[2].classList.add('on');
      const nw = document.getElementById('nw'); if (nw) nw.hidden = true; }""")
    pg.wait_for_timeout(500)
    R(pg, '#s3 > p', 'c_sign')
    pg.screenshot(path=OUT + 's5.png', full_page=True)
    open(OUT + 'c_s3_text.txt', 'w').write(pg.inner_text('#s3'))
    open(OUT + 'c_bar_text.txt', 'w').write(pg.inner_text('.cn'))

    pg.goto('https://apibase.pro/m/apibase-demo', wait_until='networkidle')
    pg.wait_for_timeout(1500)
    open(OUT + 'm_text.txt', 'w').write(pg.inner_text('body'))
    pg.screenshot(path=OUT + 's7_closed.png', full_page=True)
    R(pg, 'details.buy summary', 'm_sum', 2); R(pg, '.pcard', 'm_card_closed', 2)
    pg.locator('details.buy summary').nth(2).click()
    pg.wait_for_timeout(500)
    R(pg, '.pcard', 'm_card', 2); R(pg, '.pcard details.buy pre', 'm_ask', 2); R(pg, '.pcard details.buy button', 'm_copy', 2)
    print('ask:', pg.locator('.pcard details.buy pre').nth(2).inner_text())
    pg.screenshot(path=OUT + 's7.png', full_page=True)
    pg.locator('.pcard details.buy button').nth(2).click()
    pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 's7_copied.png', full_page=True)
    print(pg.evaluate("() => [...document.querySelectorAll('*')].filter(e=>/Tell your AI assistant/.test(e.textContent)&&e.children.length<4).slice(-3).map(e=>e.tagName+'.'+e.className)"))
    json.dump(rects, open(OUT + 'rects.json', 'w'), indent=1)
    br.close()
print(json.dumps(rects))
