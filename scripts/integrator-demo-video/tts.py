import sys, json, urllib.request, os
sys.path.insert(0, '/tmp/v0503')
import envload
envload.load()
LINES = [
 "AI assistants already shop for people. Now they can buy from your store.",
 "This is APIbase Integrator. Connect your shop in three quick steps — your store, the agreements, and your wallet. No payment. No gas.",
 "You get your own page on APIbase. Paste one link on your site — Shopify, WooCommerce, Wix, Tilda, or plain HTML.",
 "Now a shopper tells their AI agent what to buy. The agent finds your product, gets a quote, and pays in USDC.",
 "The money settles straight to your wallet, on Base or Tempo. Zero percent fee during the pilot.",
 "Let AI agents buy from your store. Connect at apibase.pro slash integrator.",
]
CNT = '/tmp/v0503/tts_chars.txt'
used = int(open(CNT).read()) if os.path.exists(CNT) else 0
need = sum(len(l) for l in LINES)
if used + need > 2000:
    sys.exit('cap exceeded: used %d need %d' % (used, need))
vid = os.environ['ELEVENLABS_VOICE_ID']
for i, t in enumerate(LINES, 1):
    body = json.dumps({"text": t, "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.8}}).encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/%s?output_format=mp3_44100_128' % vid,
        data=body, headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'content-type': 'application/json'})
    data = urllib.request.urlopen(req, timeout=120).read()
    open('/tmp/v0503/work/vo%d.mp3' % i, 'wb').write(data)
    used += len(t)
    open(CNT, 'w').write(str(used))
    print(i, len(t), len(data))
print('chars used total', used)
