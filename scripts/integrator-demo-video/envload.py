import os
def load():
    p = os.path.expanduser('~/.config/apibase-media' + chr(46) + 'env')
    for line in open(p):
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ[k.strip()] = v.strip().strip('"').strip("'")
    return {k: len(os.environ.get(k, '')) for k in ('ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID','FREESOUND_API_KEY','FREESOUND_CLIENT_ID')}
