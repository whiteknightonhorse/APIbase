import sys, json, urllib.request, urllib.parse, os
sys.path.insert(0, '/tmp/v0503')
import envload
envload.load()
tok = os.environ['FREESOUND_API_KEY']
out = []
for q in ('epic cinematic', 'cinematic trailer', 'epic orchestral', 'inspiring cinematic'):
    params = {
        'query': q, 'token': tok, 'page_size': 15,
        'filter': 'license:"Creative Commons 0" duration:[60 TO 240]',
        'fields': 'id,name,username,license,duration,url,previews,tags,avg_rating,num_ratings',
        'sort': 'rating_desc',
    }
    u = 'https://freesound.org/apiv2/search/text/?' + urllib.parse.urlencode(params)
    try:
        d = json.load(urllib.request.urlopen(u, timeout=40))
    except Exception as e:
        print('ERR', q, type(e).__name__, getattr(e, 'code', ''))
        continue
    for r in d.get('results', []):
        out.append(r)
        print(r['id'], '|', r['name'], '|', r['username'], '|', round(r['duration']), 's |', r['license'].split('/')[-3:], '|', r.get('avg_rating'), r.get('num_ratings'), '|', [t for t in r['tags'][:6]])
json.dump(out, open('/tmp/v0503/fs_results.json', 'w'))
