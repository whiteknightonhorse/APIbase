import json, urllib.request
rs = json.load(open('/tmp/v0503/fs_results.json'))
r = [x for x in rs if x['id'] == 720980][0]
print(json.dumps({k: r[k] for k in ('id', 'name', 'username', 'license', 'duration', 'url')}))
u = r['previews']['preview-hq-mp3']
open('/tmp/v0503/work/music.mp3', 'wb').write(urllib.request.urlopen(u, timeout=60).read())
